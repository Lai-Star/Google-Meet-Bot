const { exec } = require('child_process');
const fs = require('fs');
const mic = require('mic');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const JoinGoogleMeet = require('./join_google_meet');
require('dotenv').config();

/**
 * Record a single raw audio chunk and convert it to a WAV file using ffmpeg.
 * @param {string} folderPath - Directory to store audio files.
 * @param {string} baseName - Base name for the output file.
 * @param {number} durationSeconds - Duration to record (in seconds).
 * @returns {Promise<string>} - Resolves with WAV file path.
 */
async function recordSingleChunk(folderPath, counter, durationSeconds) {
    return new Promise((resolve, reject) => {
        try {
            const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
            const rawPath = path.join(folderPath, `meeting_record_${counter}_${timestamp}.raw`);
            const wavPath = path.join(folderPath, `meeting_record_${counter}_${timestamp}.wav`);

            const micInstance = mic({
                rate: '44100',
                channels: '2',
                bitwidth: '16',
                encoding: 'signed-integer',
                endian: 'little',
                fileType: 'raw',
            });

            const micInputStream = micInstance.getAudioStream();
            const outputStream = fs.createWriteStream(rawPath);

            micInputStream.pipe(outputStream);

            micInputStream.on('error', reject);
            outputStream.on('error', reject);

            micInstance.start();
            console.log(`🎤 Started recording chunk: ${rawPath}`);

            setTimeout(() => {
                micInstance.stop();
                console.log(`Stopped recording. Converting to WAV...`);

                const cmd = `ffmpeg -f s16le -ar 44100 -ac 2 -i "${rawPath}" "${wavPath}" -y`;
                exec(cmd, (err, stdout, stderr) => {
                    try { fs.unlinkSync(rawPath); } catch (_) { }

                    if (err) {
                        console.error(stderr);
                        return reject(`FFmpeg error: ${err.message}`);
                    }
                    console.log(`WAV file saved: ${wavPath}`);
                    resolve(wavPath);
                });
            }, durationSeconds * 1000);
        } catch (err) {
            console.log(err)
        }
    });
}

async function uploadWavFileToServer(wavPath) {
    const form = new FormData();
    form.append('file', fs.createReadStream(wavPath));

    try {
        console.log("Sending audio file to the server...")
        const response = await axios.post(process.env.AUDIO_PROCESS_SERVER_URL, form, {
            headers: form.getHeaders()
        });

        console.log('Upload successful:', response.data);
    } catch (err) {
        console.error('Upload failed:', err.response?.data || err.message);
    }
}

async function startMeetingRecording(folderPath, driver) {
    fs.mkdirSync(folderPath, { recursive: true });
    let counter = 1;
    const durationSeconds = process.env.RECORDING_DURATION;

    while (true) {
        try {
            const isRecording = await driver.wait(
                until.elementLocated(By.css('button[aria-label="Leave call"]')),
                10000
            );

            if (!isRecording) {
                break;
            } else {
                const filePath = await recordSingleChunk(folderPath, counter, durationSeconds);
                const fullPath = path.resolve(filePath);
                await uploadWavFileToServer(fullPath);
                counter++;
            }
        } catch (err) {
            console.error('Error during recording:', err);
            break;
        }
    }

    console.log('Continuous meeting recording ended.');
}

module.exports = { startMeetingRecording };
