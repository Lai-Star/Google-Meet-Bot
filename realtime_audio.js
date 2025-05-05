const WebSocket = require('ws');
const portAudio = require('naudiodon');
const Speaker = require('speaker');

// Configuration
const config = {
    apikey: "fjoagjaoghso",
    room_id: "101",
    comp_id: "87",
    user_id: "87",
    sessid: "",
    sample_rate: "44100"  // Updated from 48000
};

// Create a speaker instance (now stereo, 44100Hz)
const speaker = new Speaker({
    channels: 2,
    bitDepth: 16,
    sampleRate: 44100
});

// Function to find Pulse-compatible device
function findCompatibleDevice() {
    const devices = portAudio.getDevices();
    for (let i = 0; i < devices.length; i++) {
        const name = devices[i].name.toLowerCase();
        if (name.includes('pulse') || name.includes('default') || name.includes('dummyoutput')) {
            return devices[i].id;
        }
    }
    return -1;
}

async function startRealtimeAudio() {
    const deviceId = findCompatibleDevice();
    if (deviceId === -1) {
        throw new Error('Compatible audio device not found. Ensure PulseAudio with DummyOutput is running.');
    }

    const socket = new WebSocket("wss://api.kaisetsu-chat.com/ws/realtime");

    const inputConfig = {
        channelCount: 2,
        sampleFormat: portAudio.SampleFormat16Bit,
        sampleRate: 44100,
        deviceId: deviceId,
        inOptions: {
            channelCount: 2,
            sampleFormat: portAudio.SampleFormat16Bit,
            sampleRate: 44100,
            deviceId: deviceId
        }
    };

    let audioQueue = [];
    let isPlaying = false;
    let responseDone = true;
    let responseGettingTime;
    let lastPlayTime;

    return new Promise((resolve, reject) => {
        socket.on('open', () => {
            console.log("WebSocket connection established");
            socket.send(JSON.stringify(config));
            resolve();
        });

        socket.on('message', (data) => {
            try {
                const response_data = JSON.parse(data);

                if (response_data.type === "response_audio") {
                    console.log("response audio arrived");

                    if (audioQueue.length === 0) {
                        responseGettingTime = Date.now();
                        lastPlayTime = null;
                    }

                    const base64String = response_data.content;
                    const byteArray = Buffer.from(base64String, 'base64');
                    audioQueue.push(byteArray);
                }

                if (response_data.type === "response_text") {
                    if (response_data.content === 'response.audio_transcript.done') {
                        responseDone = true;
                    } else {
                        if (responseDone) {
                            console.log(`\n【アシスタント】: ${response_data.content}`);
                            responseDone = false;
                        } else {
                            process.stdout.write(response_data.content);
                        }
                    }
                }

                if (response_data.type === "input_text") {
                    console.log(`【あなた】: ${response_data.content}`);
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        });

        function enqueueAudio() {
            if (!isPlaying && Date.now() - responseGettingTime > 5000) {
                playNextAudio();
            }
        }

        function playNextAudio() {
            if (audioQueue.length === 0) {
                responseGettingTime = null;
                isPlaying = false;
                return;
            }

            if (audioQueue.length === 1) {
                lastPlayTime = Date.now();
            }

            const pcmData = audioQueue.shift();
            playPCM16(pcmData).then(playNextAudio).catch((error) => {
                console.error('Error playing PCM16 data:', error);
                playNextAudio();
            });
        }

        function playPCM16(pcmData) {
            return new Promise((resolve, reject) => {
                try {
                    console.log("speaker is working....");

                    isPlaying = true;
                    speaker.write(pcmData);

                    setTimeout(() => resolve(), 500);
                } catch (error) {
                    reject(error);
                }
            });
        }

        const audioInput = new portAudio.AudioIO({
            inOptions: inputConfig.inOptions
        });

        audioInput.on('data', (buffer) => {
            if (isPlaying || audioQueue.length || Date.now() - lastPlayTime < 10000) {
                return;
            }
            if (socket.readyState === WebSocket.OPEN) {
                const base64Data = buffer.toString('base64');
                socket.send(base64Data);
            }
        });

        audioInput.start();

        setInterval(enqueueAudio, 1000);

        socket.on('error', (error) => {
            console.error('WebSocket Error:', error);
            reject(error);
        });

        socket.on('close', () => {
            console.log('WebSocket connection closed');
            audioInput.quit();
        });

        process.on('SIGINT', () => {
            console.log('\nClosing application...');
            socket.close();
            audioInput.quit();
            process.exit(0);
        });
    });
}

module.exports = { startRealtimeAudio };
