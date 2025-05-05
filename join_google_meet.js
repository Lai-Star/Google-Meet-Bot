const os = require('os');
const fs = require('fs');
const path = require('path');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
require('dotenv').config();
const { startMeetingRecording } = require('./record_audio');

class JoinGoogleMeet {
    constructor() {
        this.meeting_active = true;

        // Create temporary Chrome profile
        // const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-'));

        const options = new chrome.Options();
        options.addArguments(
            '--headless=new',                  // Required for EC2 headless
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--use-fake-ui-for-media-stream',
            '--disable-blink-features=AutomationControlled',
            '--disable-notifications',
            '--user-data-dir=/home/ubuntu/chrome-profile'
        );

        // Optional: set Chrome binary path manually (uncomment if needed)
        // options.setChromeBinaryPath('/usr/bin/chromium-browser');

        this.driver = new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();

        // this.tempUserDataDir = tempUserDataDir;
    }

    async turnOffMicCam(meetLink) {
        try {
            await this.driver.get(meetLink);
            console.log(meetLink)
            await this.driver.sleep(10000);


            await this.driver.takeScreenshot().then(
                function (image, err) {
                    require('fs').writeFileSync('screenshot.png', image, 'base64');
                }
            );

            await this.driver.wait(until.elementLocated(By.css('div[jscontroller="lCGUBd"][jsname="hw0c9"]')), 5000);
            const micButton = await this.driver.findElement(By.css('div[jscontroller="lCGUBd"][jsname="hw0c9"]'));
            await micButton.click();
            console.log("Mic turned off");

            await this.driver.wait(until.elementLocated(By.css('div[jscontroller="lCGUBd"][jsname="psRWwc"]')), 15000);
            const camButton = await this.driver.findElement(By.css('div[jscontroller="lCGUBd"][jsname="psRWwc"]'));
            await this.driver.executeScript("arguments[0].click();", camButton);
            console.log("Camera turned off");
        } catch (error) {
            console.error('Error in turnOffMicCam:', error);
            throw error;
        }
    }

    async AskToJoin() {
        try {
            await this.driver.sleep(5000);
            // await this.driver.wait(until.elementLocated(By.css('input[jsname="YPqjbf"]')), 5000);
            // const nameInput = await this.driver.findElement(By.css('input[jsname="YPqjbf"]'));
            // await nameInput.sendKeys("Meeting Bot");
            // await this.driver.sleep(2000);

            await this.driver.wait(until.elementLocated(By.css('div[jsname="Qx7uuf"]')), 5000);
            const joinButton = await this.driver.findElement(By.css('div[jsname="Qx7uuf"]'));
            await this.driver.executeScript("arguments[0].click();", joinButton);
            // await joinButton.click();
            console.log("Asked to join");

            return this.driver;
        } catch (error) {
            console.error('Error in AskToJoin:', error);
            throw error;
        }
    }

    async waitForAdmit() {
        try {
            console.log("Waiting to be admitted...");
            await this.driver.wait(until.elementLocated(By.css('div[jsname="Qx7uuf"]')), 5000);
            const joinButton = await this.driver.findElement(By.css('div[jsname="Qx7uuf"]'));

            let admitted = false;
            while (!admitted) {
                const buttonText = await joinButton.getText();
                if (buttonText === "Join") {
                    admitted = true;
                    console.log("Admitted to the meeting");
                    await joinButton.click();
                } else {
                    await this.driver.sleep(2000);
                }
            }
        } catch (err) {
            console.error('Error while waiting for admit:', err);
        }
    }
}

async function main() {
    try {
        const meetLink = process.env.MEET_LINK;
        const duration = parseInt(process.env.RECORDING_DURATION || "5");

        if (!meetLink) throw new Error('MEET_LINK environment variable is required');

        const meet = new JoinGoogleMeet();
        await meet.turnOffMicCam(meetLink);
        const driver = await meet.AskToJoin();
        await meet.waitForAdmit();

        console.log("Admitted. Starting recording...");
        await startMeetingRecording('audio_chunks', duration, false, driver);
    } catch (error) {
        console.error('Error in main:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = JoinGoogleMeet;
