import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured on the server' },
        { status: 500 }
      );
    }

    const prompt = `You are an expert college academic schedule parser.
Analyze this college timetable image or screenshot.
Extract every scheduled class period for each day of the week (Monday, Tuesday, Wednesday, Thursday, Friday, Saturday).

Return ONLY valid JSON array with this exact structure:
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
- Expand common college abbreviations if obvious (e.g. "DBMS" -> "Database Management Systems", "CN" -> "Computer Networks", "OS" -> "Operating Systems", "DAA" -> "Design and Analysis of Algorithms", "MATH" -> "Mathematics").
- Extract the time slot cleanly (e.g. "09:00 AM - 09:55 AM"). If no time is listed, estimate standard 50-minute periods starting from 09:00 AM.
- If room/hall/lab number is available (e.g. "Room A 403", "LH-2"), include it, otherwise leave as "".
- Output ONLY the raw JSON array. Do not include markdown formatting or extra text.`;

    // Priority models for vision: fast lite first, then standard flash
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
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

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
        lastError = err.message || 'Timeout/Network issue';
      }
    }

    if (!result) {
      return NextResponse.json(
        { error: `Gemini service could not process image: ${lastError}` },
        { status: 503 }
      );
    }

    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return NextResponse.json(
        { error: 'No schedule text could be extracted from image' },
        { status: 422 }
      );
    }

    const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const periods = JSON.parse(cleaned);

    return NextResponse.json({ periods });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to parse timetable image' },
      { status: 500 }
    );
  }
}
