console.log("Environment Keys:", Object.keys(process.env).filter(k => k.includes("GITHUB") || k.includes("PAT") || k.includes("KEY") || k.includes("TOKEN")));
