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
    sample_rate: "48000"
};

// Create a speaker instance
const speaker = new Speaker({
    channels: 1,
    bitDepth: 16,
    // sampleRate: 24000
    sampleRate: 48000
});

// Function to find Stereo Mix device ID
function findStereoMixDevice() {
    const devices = portAudio.getDevices();
    for (let i = 0; i < devices.length; i++) {
        if (devices[i].name.toLowerCase().includes('stereo mix') || 
            devices[i].name.toLowerCase().includes('what you hear') ||
            devices[i].name.toLowerCase().includes('system audio') ||
            devices[i].name.toLowerCase().includes('audio device')) {
            return devices[i].id;
        }
    }
    return -1; // Return -1 if Stereo Mix is not found
}

async function startRealtimeAudio() {
    // Find Stereo Mix device
    const stereoMixDeviceId = findStereoMixDevice();
    if (stereoMixDeviceId === -1) {
        throw new Error('Stereo Mix device not found. Please enable Stereo Mix in your Windows sound settings.');
    }

    // WebSocket connection
    const socket = new WebSocket("wss://api.kaisetsu-chat.com/ws/realtime");

    // Audio input configuration
    const inputConfig = {
        channelCount: 1,
        sampleFormat: portAudio.SampleFormat16Bit,
        sampleRate: 48000,
        deviceId: stereoMixDeviceId,
        inOptions: {
            channelCount: 1,
            sampleFormat: portAudio.SampleFormat16Bit,
            sampleRate: 48000,
            deviceId: stereoMixDeviceId
        }
    };

    // Audio queue for playback
    let audioQueue = [];
    let isPlaying = false;
    let responseDone = true;
    let responseGettingTime;
    let lastPlayTime;

    return new Promise((resolve, reject) => {
        // WebSocket event handlers
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

                    if (audioQueue.length == 0) {
                        responseGettingTime = Date.now();
                        lastPlayTime = null;
                    }
                    
                    const base64String = response_data['content'];
                    const byteCharacters = atob(base64String);
                    const byteArray = new Uint8Array(byteCharacters.length);

                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteArray[i] = byteCharacters.charCodeAt(i);
                    }

                    const arrayBuffer = byteArray.buffer;
                    audioQueue.push(arrayBuffer);
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

        // Audio handling functions
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
            playPCM16(pcmData).then(() => {
                playNextAudio();
            }).catch((error) => {
                console.error('Error playing PCM16 data:', error);
                playNextAudio();
            });
        }

        function playPCM16(pcmData) {
            return new Promise((resolve, reject) => {
                try {
                    console.log("speaker is working....");
                    
                    const buffer = Buffer.from(pcmData);

                    isPlaying = true;
                    speaker.write(buffer);
        
                    setTimeout(() => {
                        resolve();
                    }, 500);

                } catch (error) {
                    reject(error);
                }
            });
        }

        // Setup audio input
        const audioInput = new portAudio.AudioIO({
            inOptions: inputConfig.inOptions
        });

        // Handle audio input
        if (responseGettingTime == null) {
            audioInput.on('data', (buffer) => {
                if (isPlaying || audioQueue.length || Date.now() - lastPlayTime < 10000) {
                    return
                }
                if (socket.readyState === WebSocket.OPEN) {
                    const base64Data = buffer.toString('base64');
                    socket.send(base64Data);
                }
            });
        }

        // Start audio input
        audioInput.start();

        // Start speaker
        setInterval(enqueueAudio, 1000);

        // Error handling
        socket.on('error', (error) => {
            console.error('WebSocket Error:', error);
            reject(error);
        });

        socket.on('close', () => {
            console.log('WebSocket connection closed');
            audioInput.quit();
        });

        // Handle process termination
        process.on('SIGINT', () => {
            console.log('\nClosing application...');
            socket.close();
            audioInput.quit();
            process.exit(0);
        });
    });
}

// Export the function for use in other files
module.exports = { startRealtimeAudio }; 