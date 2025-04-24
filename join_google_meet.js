const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { startRealtimeAudio } = require('./realtime_audio');

class JoinGoogleMeet {
    constructor() {
        this.meeting_active = true;
        
        // Create Chrome options
        const options = new chrome.Options();
        options.addArguments('--disable-blink-features=AutomationControlled');
        options.addArguments('--start-maximized');
        options.addArguments('--use-fake-ui-for-media-stream');
        
        // Set preferences for media permissions
        options.setUserPreferences({
            "profile.default_content_setting_values.media_stream_mic": 1,
            "profile.default_content_setting_values.media_stream_camera": 1,
            "profile.default_content_setting_values.geolocation": 0,
            "profile.default_content_setting_values.notifications": 1
        });

        // Initialize webdriver
        this.driver = new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();
    }

    async checkMeetingStatus() {
        try {
            await this.driver.findElement(By.css('button[aria-label="Leave call"]'));
            return true; // Meeting is active
        } catch (error) {
            console.log("Meeting ended or connection lost.");
            return false; // Meeting has ended
        }
    }

    async turnOffMicCam(meetLink) {
        try {
            // Navigate to Google Meet URL
            await this.driver.get(meetLink);

            // Turn off Microphone
            await this.driver.sleep(2000);
            const micButton = await this.driver.findElement(By.css('div[jscontroller="lCGUBd"][jsname="hw0c9"]'));
            await micButton.click();
            console.log("Turn off mic activity: Done");

            // Turn off camera
            await this.driver.sleep(2000);
            const camButton = await this.driver.findElement(By.css('div[jscontroller="lCGUBd"][jsname="psRWwc"]'));
            await camButton.click();
            console.log("Turn off camera activity: Done");
        } catch (error) {
            console.error('Error in turnOffMicCam:', error);
            throw error;
        }
    }

    async checkIfJoined() {
        try {
            // Wait for the join button to appear
            await this.driver.wait(
                until.elementLocated(By.css('div.uArJ5e.UQuaGc.Y5sE8d.uyXBBb.xKiqt')),
                60000
            );
            console.log("Meeting has been joined");
            return true;
        } catch (error) {
            console.log("Meeting has not been joined");
            return false;
        }
    }

    async AskToJoin() {
        try {
            // Wait before joining
            await this.driver.sleep(5000);

            // Enter bot name
            const nameInput = await this.driver.findElement(By.css('input[jsname="YPqjbf"]'));
            await nameInput.sendKeys("Meeting Bot");
            await this.driver.sleep(2000);

            // Click join button
            const joinButton = await this.driver.findElement(By.css('div[jsname="Qx7uuf"]'));
            await joinButton.click();
            console.log("Ask to join activity: Done");

            await startRealtimeAudio();
        } catch (error) {
            console.error('Error in AskToJoin:', error);
            throw error;
        }
    }
}

async function main() {
    try {
        const meetLink = process.env.MEET_LINK;
        const duration = parseInt(process.env.RECORDING_DURATION || "5");

        if (!meetLink) {
            throw new Error('MEET_LINK environment variable is required');
        }

        const meet = new JoinGoogleMeet();
        await meet.turnOffMicCam(meetLink);
        await meet.AskToJoin();
    } catch (error) {
        console.error('Error in main:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = JoinGoogleMeet; 