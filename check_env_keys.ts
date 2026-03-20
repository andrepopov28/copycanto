console.log("Environment Keys:", Object.keys(process.env).filter(key => key.includes("GITHUB") || key.includes("PAT") || key.includes("TOKEN") || key.includes("KEY")));
console.log("GITHUB_TOKEN length:", process.env.GITHUB_TOKEN?.length || 0);
console.log("PAT length:", process.env.PAT?.length || 0);
console.log("GOOGLE_MAPS_PLATFORM_KEY length:", process.env.GOOGLE_MAPS_PLATFORM_KEY?.length || 0);
