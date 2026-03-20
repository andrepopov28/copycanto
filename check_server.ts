import fetch from "node-fetch";

async function checkServer() {
  try {
    const response = await fetch('http://localhost:3000/api/health');
    if (response.ok) {
      const data = await response.json();
      console.log("SERVER_HEALTH:", JSON.stringify(data));
    } else {
      console.log("SERVER_NOT_OK", response.status);
    }
  } catch (error) {
    console.error("SERVER_ERROR:", error);
  }
}

checkServer();
