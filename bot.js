const { getDatabase, ref, set, update } = require('firebase/database');
const puppeteer = require('puppeteer');
const app = require('./config'); // Aapki Firebase config file

const db = getDatabase(app);
const delay = ms => new Promise(res => setTimeout(res, ms));

// GitHub Actions input arguments ko check karega
const args = process.argv.slice(2);
const sessionId = args[0];
const mobileNumber = args[1];
const appName = args[2] || "Default App";
const targetDownloadLink = args[3] || "https://google.com";

if (!sessionId || !mobileNumber) {
    console.error("❌ CRITICAL ERROR: SessionID aur MobileNumber missing hain!");
    process.exit(1);
}

// MAIN FUNCTION - JO GITHUB DIRECT RUN KAREGA
async function startGitHubWorkflow() {
    const userRef = ref(db, 'tasks/' + sessionId);
    
    try {
        // Initial Entry Set karein
        await set(userRef, {
            mobileNumber: mobileNumber,
            appName: appName,
            targetDownloadLink: targetDownloadLink,
            status: "Processing",
            whatsappCode: "",
            errorMessage: "",
            createdAt: new Date().toISOString()
        });

        console.log(`🚀 Automation Bot Started for Session: ${sessionId} | Number: ${mobileNumber}`);
        await runBot(sessionId, mobileNumber, userRef);

    } catch (error) {
        console.error("❌ Firebase Core Error:", error);
        process.exit(1);
    }
}

// 🤖 AAPKA CORE AUTOMATION BOT LOGIC (100% UNTOUCHED)
async function runBot(sessionId, mobileNumber, userRef) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36');

        // 1. Landing Page par jana
        await page.goto('https://web.quickrozgar.com/landing?code=18225893', { waitUntil: 'networkidle2' });
        await delay(3000);

        // 2. Mobile Number Input Field fill karna
        const phoneInputSelector = 'input[placeholder*="phone number"]';
        await page.waitForSelector(phoneInputSelector, { timeout: 10000 });
        await page.type(phoneInputSelector, mobileNumber, { delay: 100 });

        await page.keyboard.press('Tab');
        await delay(2000);

        // 🛑 CASE 1 Check: Already Registered
        const confirmPasswordExists = await page.$('input[placeholder*="confirm password"]');
        
        if (!confirmPasswordExists) {
            await update(userRef, { 
                status: "Error", 
                errorMessage: "This number is already registered. Please try another mobile number." 
            });
            await browser.close();
            console.log("⚠️ Number already registered. Stopping bot.");
            return;
        }

        // 🟢 CASE 2: New Registration Flow
        const defaultPassword = "Pass" + Math.floor(100000 + Math.random() * 900000);
        
        const passwordFields = await page.$$('input[type="password"]');
        if (passwordFields.length >= 2) {
            await passwordFields[0].type(defaultPassword, { delay: 50 });
            await passwordFields[1].type(defaultPassword, { delay: 50 });
        }

        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, div, span'));
            const target = buttons.find(el => el.textContent.trim().includes('Sign Up'));
            if (target) target.click();
        });
        
        await delay(5000);

        // 3. HANDLE POPUPS
        await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('button, div, span, p'));
            const startBtn = elements.find(el => el.textContent.trim().includes('Start') || el.textContent.trim().includes('Bind'));
            if (startBtn) startBtn.click();
        });
        await delay(3000);

        // 🎥 TUTORIAL POPUP BYPASS CONDITION
        await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('button, div, span, s'));
            const cancelBtn = elements.find(el => el.textContent.trim().toLowerCase() === 'cancel' || el.textContent.trim().includes('Watch Video'));
            if (cancelBtn && cancelBtn.textContent.trim().toLowerCase() === 'cancel') {
                cancelBtn.click();
            }
        });
        await delay(2000);

        // 4. GENERATE WHATSAPP CODE LAYER
        const step1Input = await page.$('input[placeholder*="Phone Number"]');
        if (step1Input) {
            await page.evaluate(el => el.value = '', step1Input);
            await step1Input.type(mobileNumber, { delay: 50 });
        }

        await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('button, div, span'));
            const getOtpBtn = elements.find(el => el.textContent.trim().includes('Get OTP') || el.textContent.trim().includes('code'));
            if (getOtpBtn) getOtpBtn.click();
        });

        // 5. EXTRACT THE 8-DIGIT VERIFICATION CODE
        await delay(4000);

        const extractedCode = await page.evaluate(() => {
            const codeBoxes = Array.from(document.querySelectorAll('div[class*="code"] input, .verification-code span, input[readonly]'));
            if (codeBoxes.length > 0) {
                return codeBoxes.map(box => box.value || box.textContent).join('').trim();
            }
            const pageText = document.body.innerText;
            const match = pageText.match(/[A-Z0-9]{4}-[A-Z0-9]{4}/) || pageText.match(/[A-Z0-9]{8}/);
            return match ? match[0] : null;
        });

        if (extractedCode) {
            console.log(`🎯 Code Extracted Successfully: ${extractedCode}`);
            await update(userRef, {
                status: "Code_Generated",
                whatsappCode: extractedCode
            });

            // 6. LIVE MONITORING FOR SUCCESS
            let maxChecks = 60; 
            while (maxChecks > 0) {
                await delay(15000);
                
                const isSuccess = await page.evaluate(() => {
                    const txt = document.body.innerText.toLowerCase();
                    return txt.includes('success') || txt.includes('connected') || txt.includes('binded') || txt.includes('online');
                });

                if (isSuccess) {
                    console.log("✅ User Successfully Linked WhatsApp!");
                    await update(userRef, { status: "Success" });
                    break;
                }
                maxChecks--;
            }
            
            if (maxChecks === 0) {
                await update(userRef, { status: "Timeout", errorMessage: "Verification timeout. Please try again." });
            }

        } else {
            await update(userRef, { status: "Error", errorMessage: "Failed to generate connection code. Please re-check number." });
        }

    } catch (botError) {
        console.error("Bot Execution Error:", botError);
        await update(userRef, { status: "Error", errorMessage: "Automation glitch: " + botError.message });
    } finally {
        if (browser) await browser.close();
        process.exit(0); // GitHub process safe close karein
    }
}

// Execution triggers here
startGitHubWorkflow();
