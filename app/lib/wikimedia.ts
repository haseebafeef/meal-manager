export interface BackgroundImage {
    url: string;
    title: string;
    artist: string;
    artistUrl: string;
    license: string;
    licenseUrl: string;
    attributionUrl: string;
}

const FALLBACK_BG: BackgroundImage = {
    url: "https://upload.wikimedia.org/wikipedia/commons/4/4d/Ilish_Bhaat.jpg",
    title: "Smoky hot rice and ilish bhaja with dal chachchori and eggplant fry is a unique combination of Bengali food habits.",
    artist: "Sohel Commons",
    artistUrl: "https://commons.wikimedia.org/wiki/User:Sohel_Commons",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/deed.en",
    attributionUrl: "https://commons.wikimedia.org/wiki/File:Ilish_Bhaat.jpg"
};

export async function fetchRandomBackgroundAction(): Promise<BackgroundImage> {
    // TEMPORARY: Return fallback immediately to avoid 429 errors during dev/debugging
    // return FALLBACK_BG; 

    try {
        // Double check avoiding API spam if revalidating too fast
        // return FALLBACK_BG; // Removed forced fallback

        const categories = [
            "Category:Quality images from Wiki Loves Bangla 2024",
            "Category:Featured pictures of Christmas food",
            "Category:Featured pictures of food",
            "Category:Featured pictures from Wiki Loves Food"
        ];
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];



        const params = new URLSearchParams({
            action: "query",
            generator: "categorymembers",
            gcmtitle: randomCategory,
            gcmnamespace: "6", // Files
            gcmlimit: "50",
            prop: "imageinfo",
            iiprop: "url|extmetadata",
            iiurlwidth: "2560", // Request a scaled version (2560px width) to prevent loading massive originals
            format: "json",
            origin: "*",
            uselang: "en" // Request English descriptions
        });

        const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; MealManager/1.0; +https://github.com/your-repo)'
            },
            // Next.js specific fetch options

            next: { revalidate: 3600 }
        });

        if (!response.ok) {
            console.error("Wikimedia API Status Error:", response.status, response.statusText);
            return FALLBACK_BG;
        }

        const data = await response.json();
        const pages = data?.query?.pages;

        if (!pages) {
            console.warn("No pages found in Wikimedia response for category:", randomCategory);
            return FALLBACK_BG;
        }

        const pageIds = Object.keys(pages);
        if (pageIds.length === 0) return FALLBACK_BG;

        // Select random image
        const randomPageId = pageIds[Math.floor(Math.random() * pageIds.length)];
        const page = pages[randomPageId];
        const imageInfo = page?.imageinfo?.[0];

        if (!imageInfo) return FALLBACK_BG;

        const metadata = imageInfo.extmetadata;

        // Use the scaled 'thumburl' if available, otherwise fallback to 'url'
        const imageUrl = imageInfo.thumburl || imageInfo.url;

        // Title Extraction: Prioritize ImageDescription, fallback to ObjectName/PageTitle
        let title = metadata?.ObjectName?.value || page.title;
        if (metadata?.ImageDescription?.value) {
            let desc = metadata.ImageDescription.value;
            // Clean HTML tags
            desc = desc.replace(/<[^>]+>/g, "").trim();
            // Remove standard language prefixes (e.g. "English:")
            desc = desc.replace(/^English:\s*/i, "");

            // Decode common HTML entities
            desc = desc.replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&#039;/g, "'");

            // Validate description length
            if (desc && desc.length < 300) {
                title = desc;
            }
        }

        // Extract Artist Name and URL from HTML
        let artistName = "Unknown";
        let artistUrl = "";

        if (metadata?.Artist?.value) {
            const artistHtml = metadata.Artist.value;
            // Try to extract name (strip tags)
            artistName = artistHtml.replace(/<[^>]+>/g, "").trim();

            // Try to extract URL
            const urlMatch = artistHtml.match(/href=\s*["']([^"']+)["']/i);
            if (urlMatch && urlMatch[1]) {
                artistUrl = urlMatch[1];
                // Fix protocol-relative URLs
                if (artistUrl.startsWith("//")) {
                    artistUrl = "https:" + artistUrl;
                }
            }
        }

        return {
            url: imageUrl,
            title: title,
            artist: artistName,
            artistUrl: artistUrl,
            license: metadata?.LicenseShortName?.value || "Unknown License",
            licenseUrl: metadata?.LicenseUrl?.value || "",
            attributionUrl: imageInfo.descriptionurl || ""
        };

    } catch (error) {
        console.error("Error fetching background:", error);
        return FALLBACK_BG;
    }
}
