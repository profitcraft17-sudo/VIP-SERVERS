const express = require('express');
const { getDatabase, ref, set, update, onValue } = require('firebase/database');
const puppeteer = require('puppeteer');
const app = require('./config'); 

const server = express();
const PORT = process.env.PORT || 3000;

server.use(express.json());
// Frontend static files ko serve karne ke liye
server.use(express.static('public')); 

const db = getDatabase(app);

// Helper function delay lagane ke liye (Bina error crash kiye system hold karne ke liye)
const delay = ms => new Promise(res => setTimeout(res, ms));

// 1. Test Route
server.get('/', (req, res) => {
    res.status(200).json({ message: "Node.js Automation Server is Running Perfectly!" });
});

// 2. MAIN AUTOMATION ROUTE (Jab user 'Get Code' par click karega)
server.post('/api/start-task', async (req, res) => {
    const { sessionId, mobileNumber, appName, targetDownloadLink } = req.body;

    if (!sessionId || !mobileNumber) {
        return res.status(400).json({ success: false, error: "Session ID aur Mobile Number zaroori hai!" });
    }

    try {
        // Step A: Database mein initial entry save karein
        const userRef = ref(db, 'tasks/' + sessionId);
        await set(userRef, {
            mobileNumber: mobileNumber,
            appName: appName || "Default App",
            targetDownloadLink: targetDownloadLink || "https://google.com",
            status: "Processing",
            whatsappCode: "",
            errorMessage: "",
            createdAt: new Date().toISOString()
        });

        // Response turant frontend ko bhej dein taaki browser hang na ho, bot background mein chalega
        res.status(200).json({ success: true, message: "Automation started in background..." });

        // Step B: Trigger Headless Puppeteer Bot
        runBot(sessionId, mobileNumber, userRef);

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🤖 CORE AUTOMATION BOT LOGIC
async function runBot(sessionId, mobileNumber, userRef) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true, // Production par true rahega, test ke liye false kar sakte hain
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        // User-agent badalna zaroori hai taaki website ko pata na chale ki yeh bot hai
        await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36');

        // 1. Landing Page par jana (Aapka referral code automatic use hoga)
        await page.goto('https://web.quickrozgar.com/landing?code=18225893', { waitUntil: 'networkidle2' });
        await delay(3000);

        // 2. Mobile Number Input Field dhundna aur fill karna
        const phoneInputSelector = 'input[placeholder*="phone number"]';
        await page.waitForSelector(phoneInputSelector, { timeout: 10000 });
        await page.type(phoneInputSelector, mobileNumber, { delay: 100 });

        // Focus hatane ke liye ya password field check karne ke liye enter/tab marna
        await page.keyboard.press('Tab');
        await delay(2000);

        // 🛑 CASE 1 Check: Kya ye number ALREADY REGISTERED hai? (Screenshot #2 vs #3)
        // Agar confirm password wala field nahi dikh raha hai, matlab account purana hai
        const confirmPasswordExists = await page.$('input[placeholder*="confirm password"]');
        
        if (!confirmPasswordExists) {
            // Already registered hai, database status update karein aur bot band karein
            await update(userRef, { 
                status: "Error", 
                errorMessage: "This number is already registered. Please try another mobile number." 
            });
            await browser.close();
            return;
        }

        // 🟢 CASE 2: New Registration Flow (Screenshot #3 & #4)
        const defaultPassword = "Pass" + Math.floor(100000 + Math.random() * 900000); // Dynamic Secure Password
        
        // Dono password fields mein type karein
        const passwordFields = await page.$$('input[type="password"]');
        if (passwordFields.length >= 2) {
            await passwordFields[0].type(defaultPassword, { delay: 50 });
            await passwordFields[1].type(defaultPassword, { delay: 50 });
        }

        // Sign Up button par click karein
        const signUpBtn = await page.$('button, .button, [class*="btn"]'); // Dynamic class selector
        // Agar generic selector na mile toh direct text options se dhundenge
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, div, span'));
            const target = buttons.find(el => el.textContent.trim().includes('Sign Up'));
            if (target) target.click();
        });
        
        await delay(5000); // Dashboard load hone ka wait karein

        // 3. HANDLE POPUPS (Screenshot #5 - Bind WhatsApp Modal)
        // Agar "Bind your WhatsApp" popup aata hai
        await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('button, div, span, p'));
            const startBtn = elements.find(el => el.textContent.trim().includes('Start') || el.textContent.trim().includes('Bind'));
            if (startBtn) startBtn.click();
        });
        await delay(3000);

        // 🎥 TUTORIAL POPUP BYPASS CONDITION (Watch Video Tutorial Bypass)
        // Agar kabhi bhi tutorial ya watch video ka window khule toh use cancel karein
        await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('button, div, span, s'));
            const cancelBtn = elements.find(el => el.textContent.trim().toLowerCase() === 'cancel' || el.textContent.trim().includes('Watch Video'));
            // Agar cancel mile toh click karein, ya popup ke close cross (X) ko target karein
            if (cancelBtn && cancelBtn.textContent.trim().toLowerCase() === 'cancel') {
                cancelBtn.click();
            }
        });
        await delay(2000);

        // 4. GENERATE WHATSAPP CODE LAYER (Screenshot #6)
        // Step 1 wale input box mein fir se phone number daalna pad sakta hai agar khali ho
        const step1Input = await page.$('input[placeholder*="Phone Number"]');
        if (step1Input) {
            await page.evaluate(el => el.value = '', step1Input); // Pehle clear karein
            await step1Input.type(mobileNumber, { delay: 50 });
        }

        // "Get OTP" / Connect button par click karein
        await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('button, div, span'));
            const getOtpBtn = elements.find(el => el.textContent.trim().includes('Get OTP') || el.textContent.trim().includes('code'));
            if (getOtpBtn) getOtpBtn.click();
        });

        // 5. EXTRACT THE 8-DIGIT VERIFICATION CODE
        // Step 2 ke andar jo code generate hota hai use wait karke copy karna hai
        await delay(4000); // Code generation time buffer

        const extractedCode = await page.evaluate(() => {
            // Agar alag-alag small input boxes mein alphanumeric characters hain (Screenshot #6)
            const codeBoxes = Array.from(document.querySelectorAll('div[class*="code"] input, .verification-code span, input[readonly]'));
            if (codeBoxes.length > 0) {
                return codeBoxes.map(box => box.value || box.textContent).join('').trim();
            }
            // Fallback strategy: pure step 2 block ke text se 8 character code nikalna
            const pageText = document.body.innerText;
            const match = pageText.match(/[A-Z0-9]{4}-[A-Z0-9]{4}/) || pageText.match(/[A-Z0-9]{8}/);
            return match ? match[0] : null;
        });

        if (extractedCode) {
            // Code mil gaya! Database mein save karein taaki frontend user ko turant dikha sake
            await update(userRef, {
                status: "Code_Generated",
                whatsappCode: extractedCode
            });

            // 6. LIVE MONITORING FOR SUCCESS (WhatsApp Connection Tracker)
            // Ab bot page par hi ruka rahega aur check karega jab tak user WhatsApp connect nahi kar leta
            let maxChecks = 60; // Max 10-15 minutes tak monitor karega (har 15 second mein ek baar)
            while (maxChecks > 0) {
                await delay(15000);
                
                const isSuccess = await page.evaluate(() => {
                    const txt = document.body.innerText.toLowerCase();
                    return txt.includes('success') || txt.includes('connected') || txt.includes('binded') || txt.includes('online');
                });

                if (isSuccess) {
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
    }
}

// Server ko port par listen karwayein
server.listen(PORT, () => {
    console.log(`Smart Automation Server successfully started on port ${PORT}`);
});

module.exports = server;
