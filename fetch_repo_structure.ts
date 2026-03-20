import fetch from "node-fetch";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.PAT || process.env.GH_TOKEN || "";

async function fetchRepo(path = "") {
  const url = `https://api.github.com/repos/andrepopov28/CopyCanto/contents/${path}`;
  console.log(`Fetching: ${url}`);
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "AI-Studio-Applet"
  };

  if (GITHUB_TOKEN) {
    headers["Authorization"] = `token ${GITHUB_TOKEN}`;
    console.log(`Using token (length: ${GITHUB_TOKEN.length})`);
  } else {
    console.log("No token found in process.env. Trying without token...");
  }

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}\n${errorText}`);
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      console.log("Files found:");
      data.forEach(item => console.log(`- ${item.name} (${item.type})`));
    } else {
      console.log("Single file/content found.");
    }
  } catch (error) {
    console.error("Error fetching repo:", error);
  }
}

fetchRepo();
