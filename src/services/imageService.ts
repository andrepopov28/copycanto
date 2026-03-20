import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateAvatar(name: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [{ parts: [{ text: `A high-quality, artistic, minimalist avatar for a music producer named "${name}". Use a vibrant, modern color palette with abstract musical elements. 3D rendered style.` }] }],
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (error) {
    console.error("Error generating avatar:", error);
  }
  return `https://picsum.photos/seed/${encodeURIComponent(name)}/200/200`;
}

export async function generateSongThumbnail(title: string, artist: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [{ parts: [{ text: `A cinematic, high-quality album cover art for a song titled "${title}" by "${artist}". The style should be atmospheric, moody, and professional. 16:9 aspect ratio.` }] }],
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
  return `https://picsum.photos/seed/${encodeURIComponent(title + artist)}/800/450`;
}
