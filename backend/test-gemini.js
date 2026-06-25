const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('API Key loaded:', Boolean(apiKey));
  if (!apiKey) {
    console.error('No API key found in .env');
    return;
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = 'gemini-2.5-flash';
  console.log('Testing model:', modelName);
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const response = await model.generateContent('Hello, say test');
    console.log('Response text:', response.response.text());
  } catch (err) {
    console.error('Error with model:', modelName, err.message);
    
    // Let's also try gemini-1.5-flash
    const fallbackModel = 'gemini-1.5-flash';
    console.log('Testing fallback model:', fallbackModel);
    try {
      const model = genAI.getGenerativeModel({ model: fallbackModel });
      const response = await model.generateContent('Hello, say test');
      console.log('Response text from 1.5-flash:', response.response.text());
    } catch (err2) {
      console.error('Error with fallback model:', fallbackModel, err2.message);
    }
  }
}

run();
