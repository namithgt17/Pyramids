import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not set in .env.local' },
        { status: 500 }
      );
    }

    const prompt = `You are an expert college academic schedule parser.
Analyze this college timetable image/document.
Extract every scheduled class period for each day (Monday, Tuesday, Wednesday, Thursday, Friday, Saturday).

Return ONLY valid JSON with this exact schema:
[
  {
    "day": "Monday",
    "subject": "Database Management Systems",
    "time": "09:00 AM - 10:00 AM",
    "room": "CS-204"
  }
]

Rules:
- "day" must be one of: "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday".
- Expand common college abbreviations if clear (e.g. "DBMS" -> "Database Management Systems", "CN" -> "Computer Networks", "OS" -> "Operating Systems").
- Extract the time slot as cleanly as possible (e.g. "09:00 AM - 10:00 AM").
- If room/lab number is available, include it, otherwise leave as "".
- Output ONLY the raw JSON array. Do not include markdown ticks (\`\`\`json) or extra conversational text.`;

    // gemini-3.5-flash-lite is the active lightning-fast vision model
    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.8-flash',
    ];

    let lastError = '';
    let result: any = null;

    for (const model of candidateModels) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: prompt },
                    {
                      inline_data: {
                        mime_type: mimeType || 'image/jpeg',
                        data: imageBase64,
                      },
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
              },
            }),
          }
        );

        clearTimeout(timeoutId);

        if (response.ok) {
          result = await response.json();
          break; // Succeeded!
        } else {
          lastError = await response.text();
        }
      } catch (err: any) {
        lastError = err.message;
      }
    }

    if (!result) {
      return NextResponse.json(
        { error: `Gemini service busy. Error: ${lastError}` },
        { status: 503 }
      );
    }
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return NextResponse.json(
        { error: 'Could not extract schedule from image' },
        { status: 422 }
      );
    }

    const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const periods = JSON.parse(cleaned);

    return NextResponse.json({ periods });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to parse image' },
      { status: 500 }
    );
  }
}
