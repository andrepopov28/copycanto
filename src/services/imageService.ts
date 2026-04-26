import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is required but was not provided. Please set the environment variable.");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function sanitizeInput(input: string): string {
  return input.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim();
}

export async function generateAvatar(name: string): Promise<string> {
  const sanitizedName = sanitizeInput(name);
  
  if (!sanitizedName) {
    throw new Error("Invalid name parameter provided.");
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [{ parts: [{ text: `A high-quality, artistic, minimalist avatar for a music producer named "${sanitizedName}". Use a vibrant, modern color palette with abstract musical elements. 3D rendered style.` }] }],
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (error) {
    console.error("Error generating avatar:", error);
  }
  return `https://picsum.photos/seed/${encodeURIComponent(sanitizedName)}/200/200`;
}

export async function generateSongThumbnail(title: string, artist: string): Promise<string> {
  const sanitizedTitle = sanitizeInput(title);
  const sanitizedArtist = sanitizeInput(artist);

  if (!sanitizedTitle || !sanitizedArtist) {
    throw new Error("Invalid title or artist parameter provided.");
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [{ parts: [{ text: `A cinematic, high-quality album cover art for a song titled "${sanitizedTitle}" by "${sanitizedArtist}". The style should be atmospheric, moody, and professional. 16:9 aspect ratio.` }] }],
      config: {
        imageConfig: {
          aspectRatio: "16:9"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (error) {
    console.error("Error generating thumbnail:", error);
  }
  return `https://picsum.photos/seed/${encodeURIComponent(sanitizedTitle + sanitizedArtist)}/800/450`;
}