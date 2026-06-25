const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = 'gemini-1.5-flash';
  
  const model = genAI.getGenerativeModel({ model: modelName });
  const prompt = `
Ban la tro ly kiem duyet cong thuc.
Hay phan tich cong thuc sau va tra ve JSON thuan:
{
  "caloriesReasonable": true,
  "nutritionValidityNotes": "...",
  "qualityScore": 0,
  "missingIngredients": [],
  "missingSteps": [],
  "feedback": "..."
}

Ten mon: Thịt bò xào hành tây
Mo ta: Món ăn ngon dễ làm
Nguyen lieu: 200g Thịt bò, 1 củ Hành tây
Calories: 350 kcal/phan
Protein: 25g, Carbs: 10g, Fat: 15g
Steps:
Buoc 1: Sơ chế nguyên liệu
Buoc 2: Xào thịt bò
`;

  try {
    const response = await model.generateContent(prompt);
    const text = response.response.text();
    console.log('Raw text:', text);
    const cleanedText = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    console.log('Cleaned text:', cleanedText);
    const aiResult = JSON.parse(cleanedText);
    console.log('Parsed successfully:', aiResult);
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
