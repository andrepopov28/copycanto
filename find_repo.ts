import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.PAT || process.env.API_KEY || process.env.GEMINI_API_KEY;
console.log("Available Env Keys:", Object.keys(process.env));
console.log("GITHUB_TOKEN length:", GITHUB_TOKEN ? GITHUB_TOKEN.length : 0);

async function fetchRepoContents(owner: string, repo: string, path: string = "") {
  if (!GITHUB_TOKEN) {
    console.error("No token found");
    return;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents${path}`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch contents for ${owner}/${repo}${path}`, await response.text());
      return;
    }

    const data = await response.json();
    console.log(`CONTENTS_OF_${path || 'root'}:` + JSON.stringify(data));
  } catch (error) {
    console.error("Error:", error);
  }
}

fetchRepoContents("andrepopov28", "CopyCanto");
