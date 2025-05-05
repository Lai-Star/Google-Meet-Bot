const express = require('express');
const app = express();
const bodyParser = require('body-parser');

const JoinGoogleMeet = require('./join_google_meet');
const { startRealtimeAudio } = require('./realtime_audio');
const { startMeetingRecording } = require('./record_audio');

const PORT = 3000;

// Middleware to parse JSON data
app.use(bodyParser.urlencoded({ extended: true }));

// POST endpoint to join a Google Meet link
app.post('/api/join-meet', async (req, res) => {
    const { meetLink } = req.body;
    if (!meetLink) {
        return res.status(400).json({ error: 'meetLink is required in the request body.' });
    }

    try {
        const meet = new JoinGoogleMeet();
        await meet.turnOffMicCam(meetLink);
        const driver = await meet.AskToJoin();
        await meet.waitForAdmit();
        // Optionally, you can start recording or other actions here
        res.status(200).json({ message: 'Successfully joined the Google Meet.' });

        startRealtimeAudio();

        startMeetingRecording('audio_chunks', driver);
    } catch (error) {
        console.error('Error joining Google Meet:', error);
        return res.status(500).json({ error: 'Failed to join the Google Meet.', details: error.message });
    }
});

// Start the server
app.listen(3000, '0.0.0.0', () => {
    console.log("Server is running on http://0.0.0.0:3000");
});

