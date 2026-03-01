const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// এনভায়রনমেন্ট ভেরিয়েবল (Render-এ সেট করবেন)
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'my_secret_token_123';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// API কী (Render-এ সেট করবেন)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// ওয়েবহুক ভেরিফিকেশন (ফেসবুকের সাথে সংযোগ)
app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);
    } else {
        res.send('Error: Wrong token');
    }
});

// মেসেজ হ্যান্ডলার
app.post('/webhook', (req, res) => {
    const body = req.body;
    
    if (body.object === 'page') {
        body.entry.forEach(entry => {
            const event = entry.messaging[0];
            const senderId = event.sender.id;
            
            if (event.message) {
                if (event.message.text) {
                    const messageText = event.message.text;
                    handleMessage(senderId, messageText);
                }
                // ছবি পাঠালে
                if (event.message.attachments) {
                    handleAttachment(senderId, event.message.attachments[0]);
                }
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// কমান্ড পার্সিং ফাংশন
function parseCommand(messageText) {
    if (messageText.startsWith('/')) {
        const parts = messageText.split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');
        return { command, args };
    }
    return null;
}

// মেইন মেসেজ হ্যান্ডলার
async function handleMessage(senderId, messageText) {
    const cmd = parseCommand(messageText);
    
    if (cmd) {
        await handleCommand(senderId, cmd.command, cmd.args);
    } else {
        await handleNormalMessage(senderId, messageText);
    }
}

// কমান্ড হ্যান্ডলার
async function handleCommand(senderId, command, args) {
    let response = '';
    
    switch(command) {
        case '/help':
        case '/start':
            response = `🤖 **আমার কমান্ড সমূহ**\n\n` +
                      `/help - এই মেসেজ দেখুন\n` +
                      `/fb [লিংক] - ফেসবুক আইডির তথ্য দেখুন\n` +
                      `/gemini [বার্তা] - Gemini AI-তে বার্তা পাঠান\n` +
                      `/gpt [বার্তা] - GPT-3-তে বার্তা পাঠান\n` +
                      `/spotify [লিংক] - স্পটিফাই গান ডাউনলোড করুন\n` +
                      `/about - বটের পরিচিতি`;
            break;
            
        case '/about':
            response = '🤖 আমি একটি অ্যাডভান্সড মেসেঞ্জার বট। Render-এ হোস্ট করা।';
            break;
            
        case '/fb':
            if (!args) {
                response = '⚠️ ফেসবুক লিংক দিন। যেমন: `/fb https://facebook.com/zuck`';
            } else {
                response = await getFacebookInfo(args);
            }
            break;
            
        case '/gemini':
            if (!args) {
                response = '⚠️ কিছু লিখুন। যেমন: `/gemini হ্যালো`';
            } else {
                response = await callGeminiAI(args);
            }
            break;
            
        case '/gpt':
            if (!args) {
                response = '⚠️ কিছু লিখুন। যেমন: `/gpt হ্যালো`';
            } else {
                response = await callGPT3(args);
            }
            break;
            
        case '/spotify':
            if (!args) {
                response = '⚠️ স্পটিফাই লিংক দিন।';
            } else {
                response = await downloadSpotify(args);
            }
            break;
            
        default:
            response = '🤔 কমান্ডটি বুঝতে পারিনি। /help দেখুন।';
    }
    
    sendMessage(senderId, response);
}

// নরমাল মেসেজ হ্যান্ডলার (যারা কমান্ড দেয় না)
async function handleNormalMessage(senderId, messageText) {
    // হাই বললে
    if (messageText.toLowerCase().includes('হাই') || messageText.toLowerCase().includes('hello')) {
        sendMessage(senderId, 'হ্যালো! কমান্ড দেখতে /help লিখুন।');
    }
    // ফেসবুক লিংক সরাসরি দিলে
    else if (messageText.includes('facebook.com/')) {
        const info = await getFacebookInfo(messageText);
        sendMessage(senderId, info);
    }
    else {
        sendMessage(senderId, 'আমি বুঝতে পারিনি। /help দেখুন।');
    }
}

// অ্যাটাচমেন্ট হ্যান্ডলার (ছবি)
async function handleAttachment(senderId, attachment) {
    if (attachment.type === 'image') {
        sendMessage(senderId, '🖼️ ছবি পেয়েছি। ইমেজ অ্যানালাইসিস ফিচার পরে যোগ হবে।');
    } else {
        sendMessage(senderId, '📎 এই ধরণের ফাইল এখনও সাপোর্ট করে না।');
    }
}

// ফেসবুক ইনফো ফাংশন (পাবলিক তথ্য)
async function getFacebookInfo(input) {
    try {
        // লিংক থেকে ইউজারনেম বের করা
        let username = input;
        if (input.includes('facebook.com/')) {
            username = input.split('facebook.com/')[1].split('/')[0].split('?')[0];
        }
        
        const url = `https://graph.facebook.com/v18.0/${username}?fields=id,name,link,picture.type(large),cover&access_token=${PAGE_ACCESS_TOKEN}`;
        const response = await axios.get(url);
        const data = response.data;
        
        let message = `👤 **${data.name}**\n`;
        message += `🆔 আইডি: ${data.id}\n`;
        message += `🔗 প্রোফাইল: ${data.link || 'নেই'}\n`;
        message += `🖼️ প্রোফাইল ছবি: ${data.picture?.data?.url || 'নেই'}\n`;
        if (data.cover) {
            message += `📸 কভার ছবি: ${data.cover.source}\n`;
        }
        return message;
    } catch (error) {
        console.error('FB Info Error:', error.response?.data || error.message);
        return '❌ তথ্য পাওয়া যায়নি। লিংকটি সঠিক কিনা দেখুন।';
    }
}

// Gemini AI কল
async function callGeminiAI(prompt) {
    if (!GEMINI_API_KEY) return '⚠️ Gemini API কী সেট করা হয়নি।';
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
        const response = await axios.post(url, {
            contents: [{ parts: [{ text: prompt }] }]
        });
        return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Gemini Error:', error.response?.data || error.message);
        return '😵 Gemini AI-তে সমস্যা হয়েছে।';
    }
}

// GPT-3 কল
async function callGPT3(prompt) {
    if (!OPENAI_API_KEY) return '⚠️ OpenAI API কী সেট করা হয়নি।';
    try {
        const url = 'https://api.openai.com/v1/chat/completions';
        const response = await axios.post(url, {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500
        }, {
            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
        });
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('GPT Error:', error.response?.data || error.message);
        return '😵 GPT-3-তে সমস্যা হয়েছে।';
    }
}

// স্পটিফাই ডাউনলোড (শুধু লিংক জেনারেট)
async function downloadSpotify(url) {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
        return '⚠️ স্পটিফাই API কী সেট করা হয়নি।';
    }
    // এখানে স্পটিফাই এপিআই কল করে ট্র্যাক তথ্য আনা যায়
    // সরলতার জন্য শুধু মেসেজ দিচ্ছি
    return '🎵 স্পটিফাই ফিচার পরে যোগ হবে। আপাতত লিংক পেয়েছি: ' + url;
}

// মেসেজ পাঠানোর ফাংশন
function sendMessage(senderId, text) {
    const requestBody = {
        recipient: { id: senderId },
        message: { text: text }
    };
    
    axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, requestBody)
        .catch(error => console.error('Send Message Error:', error.response?.data || error.message));
}

// পোর্ট সেট করা (Render নিজে পোর্ট দেয়)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Bot is running on port ${PORT}`);
});
