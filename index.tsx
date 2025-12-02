import { GoogleGenAI, Type } from "@google/genai";
import React, { useState, useCallback, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Helper for Retry Logic ---
const callWithRetry = async (apiCall: () => Promise<any>, retries = 5, baseDelay = 3000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await apiCall();
        } catch (error: any) {
             let isQuotaError = false;
             
             // Check standard HTTP status
             if (error.status === 429 || error.status === 503) isQuotaError = true;
             
             // Check error message string
             const msg = (error.message || '').toString();
             if (
                 msg.includes('429') || 
                 msg.includes('RESOURCE_EXHAUSTED') || 
                 msg.toLowerCase().includes('quota') ||
                 msg.toLowerCase().includes('rate limit')
             ) {
                 isQuotaError = true;
             }
             
             // Check nested error object structure (if JSON parsed from response)
             if (error.error && (error.error.code === 429 || error.error.status === 'RESOURCE_EXHAUSTED')) {
                 isQuotaError = true;
             }

            if (isQuotaError && i < retries - 1) {
                // Exponential backoff with jitter
                const delayTime = (baseDelay * Math.pow(2, i)) + (Math.random() * 1000);
                console.warn(`API Rate Limit hit (Attempt ${i + 1}/${retries}). Retrying in ${Math.round(delayTime)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayTime));
                continue;
            }
            throw error;
        }
    }
};
// ------------------------------

// Professionally revised lists based on international music terminology standards
const INITIAL_GENRE_OPTIONS = [
  // Core Genres
  "Pop", "Rock", "Hip Hop", "R&B & Soul", "Jazz", "Blues", "Country", "Folk", "Dangdut", "Reggae", "Latin", "Classical", "Funk", "Metal", "World", "Indie", "Afrobeats", "Soundtrack", "Experimental", "New Age", "Spoken Word",
  // Major Electronic Genres
  "Electronic", "House", "Techno", "Trance", "Dubstep", "Drum and Bass", "Ambient"
];

const INITIAL_SUBGENRE_OPTIONS = [
  // Indonesian & Regional Fusion
  "Campursari", "Dangdut Electronic Fusion", "Indonesian Electronic Dance Fusion", "Indonesian Folk/Ethnic Fusion", "Indonesian Traditional Dance Fusion", "Jaipongan",

  // Dangdut Subgenres
  "Dangdut Klasik", "Dangdut Kontemporer", "Dangdut Koplo",
  
  // Pop Subgenres
  "Art Pop", "Baroque Pop", "Bubblegum Pop", "C-Pop", "Chamber Pop", "Dance-Pop", "Dream Pop", "Hyperpop", "Indie Pop", "J-Pop", "Jangle Pop", "K-Pop", "Pop Ballad", "Power Pop", "Sophisti-Pop", "Synth-pop",
  
  // Rock Subgenres
  "Alternative Rock", "Art Rock", "Blues Rock", "Emo", "Folk Rock", "Garage Rock", "Glam Rock", "Grunge", "Hard Rock", "Indie Rock", "Math Rock", "Noise Rock", "Post-Hardcore", "Post-Punk", "Post-Rock", "Progressive Rock", "Psychedelic Rock", "Punk Rock", "Shoegaze", "Southern Rock", "Stoner Rock", "Surf Rock",
  
  // Metal Subgenres
  "Alternative Metal", "Avant-Garde Metal", "Black Metal", "Death Metal", "Djent", "Doom Metal", "Folk Metal", "Glam Metal", "Gothic Metal", "Groove Metal", "Heavy Metal", "Industrial Metal", "Metalcore", "Nu Metal", "Power Metal", "Progressive Metal", "Sludge Metal", "Speed Metal", "Symphonic Metal", "Thrash Metal",
  
  // Hip Hop Subgenres
  "Boom Bap", "Chopped and Screwed", "Cloud Rap", "Conscious Hip Hop", "Crunk", "Drill", "G-Funk", "Gangsta Rap", "Grime", "Horrorcore", "Hyphy", "Lo-fi Hip Hop", "Mumble Rap", "Political Hip Hop", "Trap", "UK Drill",
  
  // R&B & Soul Subgenres
  "Alternative R&B", "Contemporary R&B", "Doo-Wop", "Funk", "Motown", "Neo-Soul", "Psychedelic Soul", "Quiet Storm",
  
  // Jazz Subgenres
  "Acid Jazz", "Avant-Garde Jazz", "Bebop", "Big Band", "Bossa Nova", "Cool Jazz", "Free Jazz", "Hard Bop", "Jazz Fusion", "Latin Jazz", "Modal Jazz", "Smooth Jazz", "Swing",
  
  // Blues Subgenres
  "Acoustic Blues", "Chicago Blues", "Delta Blues", "Electric Blues", "Texas Blues",
  
  // Country Subgenres
  "Americana", "Bakersfield Sound", "Bluegrass", "Country Pop", "Country Rock", "Honky Tonk", "Nashville Sound", "Outlaw Country",
  
  // Folk Subgenres
  "American Folk", "Anti-Folk", "Celtic Folk", "Chamber Folk", "Folk-Punk", "Folk Rock", "Freak Folk", "Neofolk", "Psychedelic Folk", "Singer-Songwriter",

  // Latin Subgenres
  "Bachata", "Bolero", "Cumbia", "Merengue", "Reggaeton", "Salsa", "Tango",
  
  // Reggae Subgenres
  "Dancehall", "Dub", "Rocksteady", "Ska",

  // Classical Subgenres
  "Baroque", "Classical Period", "Impressionist", "Medieval", "Minimalism", "Modern Classical", "Renaissance", "Romantic",

  // Electronic (General) Subgenres
  "Ambient", "Bass House", "Berlin School", "Big Beat", "Breakbeat", "Chillwave", "Chiptune", "Downtempo", "Electro", "Eurodance", "Future Bass", "Gabber", "Glitch", "Glitch Hop", "Hardcore", "Hardstyle", "IDM (Intelligent Dance Music)", "Illbient", "Industrial", "Jersey Club", "Phonk", "Psybient", "Synthwave", "Trap (Electronic)", "Trip Hop", "UK Bass", "UK Garage", "Vaporwave", "Witch House",
  
  // House Subgenres
  "Acid House", "Chicago House", "Deep House", "French House", "Lo-fi House", "Melodic House", "Progressive House", "Tech House", "Tropical House",

  // Techno Subgenres
  "Acid Techno", "Detroit Techno", "Dub Techno", "Hard Techno", "Industrial Techno", "Minimal Techno",

  // Trance Subgenres
  "Goa Trance", "Progressive Trance", "Psytrance", "Tech Trance", "Uplifting Trance", "Vocal Trance",

  // Dubstep Subgenres
  "Brostep", "Chillstep", "Future Garage", "Riddim",

  // Drum and Bass Subgenres
  "Jungle", "Jump-Up", "Liquid Drum and Bass", "Neurofunk",
  
  // Experimental & Avant-Garde
  "Drone", "Free Improvisation", "Lowercase", "Musique Concrète", "Noise", "Noise Pop"
];

const INITIAL_WORLD_MUSIC_OPTIONS = [
    // Asia
    "Arabic Maqam",
    "Bhangra",
    "Chinese Guqin",
    "Indian Carnatic Ragas",
    "Indian Hindustani Classical",
    "Indonesian Gamelan (Javanese & Balinese)",
    "Indonesian Kroncong",
    "Japanese Koto",
    "Javanese Campursari",
    "Klezmer",
    "Korean Pansori",
    "Mongolian Khoomei (Throat Singing)",
    "Persian Dastgah",
    "Qawwali",
    "Sephardic Music",
    "Sundanese Jaipongan",
    "Thai Piphat",
    "Turkish Makam",
    "Vietnamese Nhã nhạc",
    
    // Africa
    "Congolese Soukous",
    "Ethiopian Jazz (Ethio-jazz)",
    "Highlife",
    "Isicathamiya",
    "Jùjú Music",
    "Malian Griot Music",
    "Moroccan Gnawa",
    "Rai",
    "South African Mbube",
    "Taarab",
    "Tuareg Desert Blues",
    "West African Afrobeat",
    "Zimbabwean Mbira Music",

    // Americas
    "Andean Huayno",
    "Appalachian Folk",
    "Argentinian Tango",
    "Brazilian Bossa Nova",
    "Cajun Music",
    "Calypso",
    "Colombian Cumbia",
    "Cuban Son",
    "Forró",
    "Jamaican Dub",
    "Mento",
    "Mexican Mariachi",
    "Native American Pow-wow music",
    "Reggae",
    "Samba",
    "Soca",
    "Son Jarocho",
    "Zydeco",
    
    // Europe
    "Balkan Brass Band",
    "Celtic Folk (Irish & Scottish)",
    "Fado (Portugal)",
    "Flamenco (Spain)",
    "Polka",
    "Rembetika (Greece)",
    "Russian Balalaika Music",
    "Scandinavian Kulning",
    
    // Oceania
    "Australian Didgeridoo Music",
    "Maori Haka & Waiata",
    "Melanesian Bamboo Band",
    "Polynesian Hula Chants",

    // Experimental & Fusion
    "Afro-Cuban Fusion",
    "Afro-Futurism",
    "Ambient World Music",
    "Balkan-Klezmer Fusion",
    "Celtic Punk",
    "Electro-Cumbia",
    "Electro-Folk",
    "Ethno-Jazz",
    "Ethno-Techno",
    "Global Bass",
    "Global Fusion",
    "Psychedelic World Fusion",
    "Raga Rock",
    "Tropical Bass",
];

const MOOD_OPTIONS = ["Energetic", "Joyful", "Melancholic", "Reflective", "Aggressive", "Calm", "Romantic", "Somber", "Powerful", "Transcendent"];
const THEME_OPTIONS = ["Party", "Cultural", "Storytelling", "Love", "Life", "Protest", "Nature", "Destiny", "Truth", "Existential"];
const KEY_OPTIONS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const TIME_SIGNATURE_OPTIONS = ["4/4", "3/4", "6/8", "2/4", "5/4", "7/8", "9/8", "11/8"];
const LYRIC_LANGUAGE_OPTIONS = ["Indonesian", "English"];

const TEMPLATE_BLOCK_2 = `
[STYLE_DESCRIPTION_SECTION]
`;

// FIX: Declare p5 to resolve global type error for p5.js library.
declare const p5: any;

const MOOD_COLORS = {
  Energetic: ['#FFD700', '#FFA500', '#FF4500'],
  Joyful: ['#00FF7F', '#ADFF2F', '#FFFF00'],
  Melancholic: ['#4682B4', '#191970', '#8A2BE2'],
  Reflective: ['#2E8B57', '#008B8B', '#B0C4DE'],
  Aggressive: ['#FF0000', '#8B0000', '#FFFFFF', '#000000'],
  Calm: ['#ADD8E6', '#E0FFFF', '#AFEEEE'],
  Romantic: ['#FF69B4', '#FFB6C1', '#DB7093'],
  Somber: ['#2F4F4F', '#483D8B', '#000000'],
  Powerful: ['#DC143C', '#000000', '#FFD700'],
  Transcendent: ['#E6E6FA', '#F0F8FF', '#F5FFFA'],
  Default: ['#BB86FC', '#03DAC6', '#FFFFFF'],
};

const MusicVisualizer = ({ tempo, mood, songTitle, artistRef }) => {
  const sketchRef = useRef();

  useEffect(() => {
    const sketch = (p) => {
      let particles = [];
      const colors = MOOD_COLORS[mood] || MOOD_COLORS.Default;
      const beatTime = (60 / tempo) * 1000; // Beat duration in milliseconds
      let lastBeat = 0;
      let beatSize = 1;

      class Particle {
        // FIX: Declare class properties to satisfy TypeScript.
        pos: any;
        vel: any;
        acc: any;
        maxSpeed: number;
        color: any;

        constructor() {
          this.pos = p.createVector(p.random(p.width), p.random(p.height));
          this.vel = p.createVector(p.random(-1, 1), p.random(-1, 1));
          this.acc = p.createVector(0, 0);
          this.maxSpeed = 2;
          this.color = p.color(p.random(colors));
        }

        update() {
          this.vel.add(this.acc);
          this.vel.limit(this.maxSpeed);
          this.pos.add(this.vel);
          this.acc.mult(0);
        }

        edges() {
          if (this.pos.x > p.width) this.pos.x = 0;
          if (this.pos.x < 0) this.pos.x = p.width;
          if (this.pos.y > p.height) this.pos.y = 0;
          if (this.pos.y < 0) this.pos.y = p.height;
        }

        display() {
          p.noStroke();
          p.fill(this.color);
          p.ellipse(this.pos.x, this.pos.y, 4, 4);
        }
      }

      p.setup = () => {
        const container = sketchRef.current;
        p.createCanvas(container.offsetWidth, 400).parent(sketchRef.current);
        for (let i = 0; i < 100; i++) {
          particles.push(new Particle());
        }
      };

      p.draw = () => {
        p.background(18, 18, 18, 50); // Fading background

        // Display Song Title and Artist
        p.textAlign(p.CENTER, p.CENTER);
        p.fill(255, 255, 255, 100); 
        p.textSize(28);
        p.text(songTitle || 'Untitled Song', p.width / 2, p.height / 2 - 20);
        p.textSize(18);
        p.fill(255, 255, 255, 80);
        p.text(artistRef || 'Independent Artist', p.width / 2, p.height / 2 + 20);

        // Central pulsing orb
        const currentTime = p.millis();
        if (currentTime - lastBeat > beatTime) {
            lastBeat = currentTime;
            beatSize = 1.5;
        }
        beatSize = p.lerp(beatSize, 1, 0.1); // Smoothly return to normal size
        
        const orbSize = p.width / 4 * beatSize;
        const mainColor = p.color(colors[0]);
        mainColor.setAlpha(150);
        p.fill(mainColor);
        p.noStroke();
        p.ellipse(p.width / 2, p.height / 2, orbSize, orbSize);


        // Particles
        for (let particle of particles) {
          particle.update();
          particle.edges();
          particle.display();
        }
      };

      p.windowResized = () => {
          const container = sketchRef.current;
          if(container) {
             p.resizeCanvas(container.offsetWidth, 400);
          }
      };
    };

    let p5Instance = new p5(sketch, sketchRef.current);

    // Cleanup function
    return () => {
      p5Instance.remove();
    };
  }, [tempo, mood, songTitle, artistRef]);

  return <div ref={sketchRef} className="visualizer-canvas"></div>;
};


const App = () => {
  // Dynamic options states
  const [genreOptions, setGenreOptions] = useState(INITIAL_GENRE_OPTIONS);
  const [subgenreOptions, setSubgenreOptions] = useState(INITIAL_SUBGENRE_OPTIONS);
  const [worldMusicOptions, setWorldMusicOptions] = useState(INITIAL_WORLD_MUSIC_OPTIONS);
  const [moodOptions, setMoodOptions] = useState(MOOD_OPTIONS);
  const [themeOptions, setThemeOptions] = useState(THEME_OPTIONS);

  // Form states
  const [genre, setGenre] = useState(genreOptions[0]);
  const [subgenre, setSubgenre] = useState(subgenreOptions[0]);
  const [worldMusic, setWorldMusic] = useState(worldMusicOptions[0]);
  const [mood, setMood] = useState(moodOptions[0]);
  const [theme, setTheme] = useState(themeOptions[0]);
  const [lyricLanguage, setLyricLanguage] = useState(LYRIC_LANGUAGE_OPTIONS[0]);
  const [duration, setDuration] = useState("4");
  const [songTitle, setSongTitle] = useState("");
  const [artistRef, setArtistRef] = useState("");
  const [tempo, setTempo] = useState(120);
  const [key, setKey] = useState(KEY_OPTIONS[0]);
  const [timeSignature, setTimeSignature] = useState(TIME_SIGNATURE_OPTIONS[0]);
  const [numberOfImages, setNumberOfImages] = useState(4);
  const [backgroundTrack, setBackgroundTrack] = useState(null);
  const [backgroundTrackUrl, setBackgroundTrackUrl] = useState(null);


  // App states
  const [loading, setLoading] = useState(false);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [error, setError] = useState(null);
  const [outputBlocks, setOutputBlocks] = useState([]);
  const [sources, setSources] = useState([]); // Store grounding sources
  const [imageLoading, setImageLoading] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [imageError, setImageError] = useState(null);
  const [showVisualizer, setShowVisualizer] = useState(false);
  
  // Refs for cleanup
  const backgroundTrackUrlRef = useRef(backgroundTrackUrl);
  backgroundTrackUrlRef.current = backgroundTrackUrl;


  useEffect(() => {
    // Cleanup function to run when component unmounts
    return () => {
      if (backgroundTrackUrlRef.current) {
        URL.revokeObjectURL(backgroundTrackUrlRef.current);
      }
    };
  }, []);

  const handleAssistantClick = async () => {
    setAssistantLoading(true);
    setError(null);
    try {
      let prompt = "";
      const isSpecificSong = songTitle.trim().length > 0 && artistRef.trim().length > 0;
      let requestConfig = {};
      
      if (isSpecificSong) {
         // Enable Search Tool for accuracy
         requestConfig = {
             tools: [{ googleSearch: {} }]
         };
         // Revised prompt to force factual retrieval over generation
         prompt = `Act as a Music Intelligence Agent.
Target Request: Song "${songTitle}", Artist Reference "${artistRef}".

**OBJECTIVE:**
Determine the best metadata (Genre, BPM, Key, etc.) for this request.

**ANALYSIS LOGIC:**
1. **OFFICIAL CHECK:** Check if "${songTitle}" is an existing song officially released by "${artistRef}".
   - IF YES: Retrieve the specific official technical metadata for that song.
2. **COVER/REMIX CHECK:** IF NO (Song/Artist mismatch), perform a deep search to find the **ORIGINAL ARTIST** of "${songTitle}".
   - **Note:** The user's input for Title might actually contain the original artist name (e.g. "Sirna band power metal"). Parse this intelligently.
   - **Example:** If Title is "Sirna" (or "Sirna band power metal") and Artist is "Avenged Sevenfold", FIND the original band (e.g., Power Metal) first.
   - **Then, determine parameters for a COVER version** of "${songTitle}" in the style of "${artistRef}".
     - **Genre/Mood/Subgenre:** Must match the style/discography of the TARGET artist "${artistRef}".
     - **Tempo/Key/TimeSig:** Suggest values that fit "${artistRef}"'s style but work for the song structure.
     - **Theme/Language:** Inherit from the ORIGINAL song "${songTitle}".
   - IF NO ORIGINAL SONG FOUND: Treat as a completely new song composition inspired by "${artistRef}".

**TASK:**
Perform a deep search across multiple databases (Tunebat, SongBPM, Genius, Metal Archives, MusicBrainz) to verify song existence and artist styles.

Return ONLY a valid JSON object. Do not add markdown formatting or explanations.
If exact values are not explicitly found, provide your best expert estimate based on the audio style.

Required JSON Structure:
{
  "genre": "Specific Genre",
  "subgenre": "Specific Subgenre",
  "worldMusic": "Cultural Influence (or 'None')",
  "mood": "Primary Mood",
  "theme": "Lyrical Theme",
  "tempo": Number (BPM),
  "key": "Key (e.g. C# Minor)",
  "timeSignature": "Time Sig (e.g. 7/8)",
  "lyricLanguage": "Language",
  "durationMinutes": Number
}`;

      } else {
         // Standard Creative Mode (Schema constrained)
         requestConfig = {
           responseMimeType: "application/json",
           responseSchema: {
             type: Type.OBJECT,
             properties: {
               genre: { type: Type.STRING },
               subgenre: { type: Type.STRING },
               worldMusic: { type: Type.STRING },
               mood: { type: Type.STRING },
               theme: { type: Type.STRING },
               tempo: { type: Type.NUMBER },
               key: { type: Type.STRING },
               timeSignature: { type: Type.STRING },
               lyricLanguage: { type: Type.STRING },
               durationMinutes: { type: Type.NUMBER },
             },
           },
         };
         
         prompt = `You are an expert music analyst and A&R scout. Your task is to suggest a complete set of parameters for a new hit song.
First, define a unique sonic identity by suggesting a 'genre', 'subgenre', 'worldMusic' influence, 'mood', 'theme', and 'lyricLanguage'.
Then, suggest a technically appropriate 'tempo', 'key', and 'timeSignature'.

Create a novel classification if needed (e.g., 'Cinematic Pop', 'Downtempo Gamelan'). Base suggestions on global and Indonesian music trends.`;
        if (artistRef) {
          prompt += ` Base your suggestions on the musical style of: ${artistRef}.`;
        }
      }

      const response = await callWithRetry(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: requestConfig,
      }));

      let suggestions;
      
      if (isSpecificSong) {
          // Robust JSON extraction for search results
          let text = response.text || "";
          
          // Clean up markdown code blocks if present
          text = text.replace(/```json/g, "").replace(/```/g, "");
          
          // Find the JSON object
          const firstOpen = text.indexOf('{');
          const lastClose = text.lastIndexOf('}');
          
          if (firstOpen !== -1 && lastClose !== -1) {
              const jsonString = text.substring(firstOpen, lastClose + 1);
              try {
                  suggestions = JSON.parse(jsonString);
              } catch (e) {
                  console.error("JSON Parse Error:", e);
                  console.log("Raw text:", text);
                  throw new Error("Found data but could not format it. Please try again.");
              }
          } else {
             // Fallback: If no JSON found, log and throw
             console.log("Raw response (No JSON found):", text);
             throw new Error("Could not retrieve specific song data. Please try again.");
          }
      } else {
          // Standard JSON response
          suggestions = JSON.parse(response.text);
      }

      // Update options dynamically to include the specific/niche results from the AI
      if (suggestions.genre) {
          setGenreOptions(prev => {
              if(!prev.includes(suggestions.genre)) return [suggestions.genre, ...prev];
              return prev;
          });
          setGenre(suggestions.genre);
      }

      if (suggestions.subgenre) {
          setSubgenreOptions(prev => {
              if(!prev.includes(suggestions.subgenre)) return [suggestions.subgenre, ...prev];
              return prev;
          });
          setSubgenre(suggestions.subgenre);
      }

      if (suggestions.worldMusic) {
          setWorldMusicOptions(prev => {
              if(!prev.includes(suggestions.worldMusic)) return [suggestions.worldMusic, ...prev];
              return prev;
          });
          setWorldMusic(suggestions.worldMusic);
      }
      
      if (suggestions.mood) {
          setMoodOptions(prev => {
              if(!prev.includes(suggestions.mood)) return [suggestions.mood, ...prev];
              return prev;
          });
          setMood(suggestions.mood);
      }

      if (suggestions.theme) {
          setThemeOptions(prev => {
              if(!prev.includes(suggestions.theme)) return [suggestions.theme, ...prev];
              return prev;
          });
          setTheme(suggestions.theme);
      }

      if (suggestions.tempo && typeof suggestions.tempo === 'number') setTempo(Math.round(Math.max(40, Math.min(220, suggestions.tempo))));
      
      // Update key options if the AI returns a key not in the list (e.g. "C# Minor") or strictly match
      if (suggestions.key) {
           // We stick to the basic list for UI consistency, but if strictly needed we could expand. 
           // For now, try to match the root note.
           const match = KEY_OPTIONS.find(k => suggestions.key.startsWith(k));
           if(match) setKey(match);
      }
      
      if (suggestions.timeSignature) {
           // If it's a complex signature like 7/8, make sure it's selected
           if (TIME_SIGNATURE_OPTIONS.includes(suggestions.timeSignature)) {
               setTimeSignature(suggestions.timeSignature);
           } else {
               // If not in list, add it temporarily or find closest? 
               // For now, we only select if it exists, or the user manually sets it.
               // Let's rely on the user manual override or standard list.
               // Actually, for "Tiga Titik Hitam" (7/8), it IS in the list.
           }
      }

      // Handle Lyric Language
      if (suggestions.lyricLanguage) {
        if (!LYRIC_LANGUAGE_OPTIONS.includes(suggestions.lyricLanguage)) {
           if(suggestions.lyricLanguage.toLowerCase().includes('indonesia')) setLyricLanguage('Indonesian');
           else if(suggestions.lyricLanguage.toLowerCase().includes('english')) setLyricLanguage('English');
        } else {
           setLyricLanguage(suggestions.lyricLanguage);
        }
      }

      // Handle Duration (switch between 4 and 8 min)
      if (suggestions.durationMinutes) {
          setDuration(suggestions.durationMinutes >= 6 ? "8" : "4");
      }


    } catch (e) {
      console.error(e);
      let errorMsg = "The AI assistant failed to provide suggestions. Please try again.";
      if (e.message && (e.message.includes('429') || e.message.includes('quota'))) {
          errorMsg = "API Rate Limit Exceeded. Please try again in a minute.";
      }
      setError(errorMsg);
    } finally {
      setAssistantLoading(false);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setOutputBlocks([]);
    setGeneratedImages([]);
    setSources([]);
    setImageError(null);
    setShowVisualizer(false);
    
    const maxTokens = 8192;
    const thinkingBudget = 512;

    const isSpecificSong = songTitle.trim().length > 0 && artistRef.trim().length > 0;

    const finalTemplate = `[title: ${songTitle || 'Untitled'}]
[artist: ${artistRef || 'Unknown Artist'}]
[genre: ${genre}]
[subgenre: ${subgenre}]
[world music influence: ${worldMusic}]
[tempo: ${tempo} BPM]
[key: ${key}]
[time signature: ${timeSignature}]
[lyric language: ${lyricLanguage}]
[duration: ${duration === "4" ? "~4 min" : "~8 min"}]
[primary emotion: (Analyze and fill)]
[secondary emotion: (Analyze and fill)]
[mood: ${mood}]
[theme: ${theme}]
[narrative style: (Analyze and fill)]
[rhyme scheme: (Analyze and fill)]
[metaphor: (Analyze and fill)]
[hook/tagline: (Analyze and fill)]

[Song Composition]
{lyricInstruction}`;

    const lyricInstruction = isSpecificSong 
    ? `As a professional Musical Director and Lead Producer, your task is to produce a comprehensive, industry-standard production sheet for: "${songTitle}" by "${artistRef}".

**OBJECTIVE:** 
Provide a professional production sheet. **CRITICAL: The TOTAL output must be STRICTLY under 3000 characters.** Keep the content concise and impactful.

**DURATION & STRUCTURE CONTROL (STRICT):**
- **User Selected Duration:** ${duration} minutes.
- **IF 4 MIN:** Use "Radio Edit" Structure (Intro, V1, C1, V2, C2, Bridge, Chorus 3, Outro). End timestamps around 4:00.
- **IF 8 MIN:** Use "Epic/Progressive" Structure (Intro, V1, C1, V2, C2, Extended Solos, Ambient Interlude, Chorus 3, Outro). End timestamps around 8:00.
- **Timestamps MUST align with the chosen duration.**

**LOGIC BRANCH (CRITICAL):**
1. **MATCH FOUND (TRANSCRIPTION):** If "${songTitle}" is a known song by "${artistRef}":
   - **Transcribe with precision but brevity.** 
   - Capture key nuances: guitar tones, drum patterns, vocal delivery.
   - Introduction: "[As a professional music transcriber, here is the exact original structure, lyrics, and chords for the song "${songTitle}" by "${artistRef}"]"

2. **STYLE MISMATCH (COVER/REMIX):** If "${songTitle}" is a famous song by a DIFFERENT artist (e.g. User asks for "Sirna" by "Avenged Sevenfold", but "Sirna" is originally by the band "Power Metal"):
   - **IDENTIFY ORIGINAL:** Search and identify the ORIGINAL artist (e.g. "Power Metal" from Indonesia).
   - **LYRICS:** STRICTLY use the ORIGINAL lyrics from the original artist. Do not change the lyrics.
   - **CHORDS:** STRICTLY maintain the ORIGINAL CHORD PROGRESSION of the source song. Do not change the chords to generic ones. Use the specific chords from the original recording.
   - **ARRANGEMENT:** Apply the sonic signature of "${artistRef}" (e.g. Avenged Sevenfold) to these original lyrics and chords. (e.g. If target is Metal: play original chords with heavy distortion; if Jazz: re-voice original chords but keep root movement).
   - **ESSENCE:** Retain the melodic core and emotional impact of the original song.
   - **DETAIL:** Concisely describe how the target artist would change the feel while keeping the song recognizable.
   - Introduction: "[Re-imagined arrangement of "${songTitle}" (originally by [Original Artist]) in the style of "${artistRef}"]"

**MANDATORY RULES:**
1. **HEADER:** STRICTLY USE THE PROVIDED TEMPLATE HEADER VALUES.
2. **FORMATTING:**
   - Chords strictly **ABOVE** lyrics in [Square Brackets].
   - **CRITICAL:** ALL CHORDS MUST BE WRAPPED IN SQUARE BRACKETS (e.g. [Em], [D], [C#m]).
   - **Section Blocks:** CONSOLIDATE ALL METADATA INTO ONE BRACKETED BLOCK PER SECTION.
   - **New Concise Format:** [Section, Time, BPM, Vibe | Instr: ..., | Prod: ..., | Perf: ...]
   - **ABBREVIATIONS:** Use 'Instr', 'Prod', 'Perf' instead of full words. Use 'w/' for 'with'.
   - **NO BOLD MARKDOWN:** Do not use '**' inside the brackets to save characters.
   - **TELEGRAPHIC STYLE:** Write Notes in fragments (e.g., "Heavy reverb. Wide mix." instead of "Apply heavy reverb and make the mix wide.").
   - **SUMMARIZE REPEATS:** If a section repeats, refer to the previous instance (e.g. "[Chorus 2, 3:00-3:45 | Same as Chorus 1 but louder]").

**EXAMPLE OUTPUT:**
[title: ${songTitle}]
[artist: ${artistRef}]
...
[Song Composition]
[Re-imagined arrangement of "${songTitle}" in the style of "${artistRef}"...]

[Intro, 0:00-0:50, 155 BPM | Ethereal Build | Instr: Clean Gtr, Strings, Synths | Prod: Heavy reverb. Spacious mix. | Perf: Gentle touch.]
[Em]       [D]
[Em]       [D]

[Verse 1, 0:50-1:30, 155 BPM | Driving Groove | Instr: Full Band, Tight Drums | Prod: Dry vocals. Kick lock w/ bass. | Perf: Bass slide at bar 4.]
[Em]
(Lyrics...)
`
    : `As a master lyricist and lead producer, your task is to generate a professional production bible for a new hit song.

**OBJECTIVE:**
Create a professional arrangement. **CRITICAL: The TOTAL output must be STRICTLY under 3000 characters.**

**DURATION CONTROL:**
- **User Selected Duration:** ${duration} minutes.
- **IF 4 MIN:** Standard Radio Edit. End around 4:00.
- **IF 8 MIN:** Epic Structure with extended solos/instrumentals. End around 8:00.

**CORE INSTRUCTION:**
Create an original song in the style of '${genre}'.
The chord progressions must be **original, sophisticated, and unpredictable**.

**FORMATTING:**
- Chords must be strictly **ABOVE** lyrics.
- **CRITICAL:** ALL CHORDS MUST BE WRAPPED IN SQUARE BRACKETS (e.g. [Am], [F], [G7]).
- **Section Blocks:** CONSOLIDATE ALL METADATA INTO ONE BRACKETED BLOCK PER SECTION.
- **New Concise Format:** [Section, Time, BPM, Vibe | Instr: ..., | Prod: ..., | Perf: ...]
- **ABBREVIATIONS:** Use 'Instr', 'Prod', 'Perf'.
- **NO BOLD MARKDOWN:** Do not use '**' inside the brackets.
- **TELEGRAPHIC STYLE:** Use short phrases (e.g., "Deep reverb. Aggressive compression.").

**EXAMPLE OUTPUT:**
[Intro, 0:00-0:18, 144 BPM | Clean Arpeggios | Instr: Nylon guitar, Rainstick | Prod: Large hall reverb. Rainstick panned left | Perf: Gentle fingerstyle]
[Am]       [F]
[Am]       [F]
`;

    // Concatenate the style summary block at the end
    const fullTemplate = finalTemplate.replace('{lyricInstruction}', lyricInstruction) + `\n\n${TEMPLATE_BLOCK_2}`;

    const promptContext = isSpecificSong
      ? `You are a strict Music Transcription & Arrangement Engine. User request: "${songTitle}" by "${artistRef}".
      
      **EXECUTION STEPS:**
      1. **ANALYZE:** Determine if this is a direct transcription request (original song) or a cover/remix request (mismatched artist).
      2. **HEADER SOURCE OF TRUTH:** The Metadata Header values in the input template (Genre, Subgenre, World Music, Tempo, Key, Time Signature, Language, Duration) are **FIXED**. You MUST copy them exactly. Do not use search results to "correct" these specific header fields.
      3. **SEARCH:** Use search tools to find the lyrics of the *original* song.
         - **CRITICAL:** If the Song Title is "Sirna" (or "Sirna band power metal"), ensure you find the lyrics by the Indonesian band "Power Metal". Do not invent lyrics.
      4. **EXPAND:** Provide high-level musical analysis.
      5. **STYLE DESCRIPTION:** In the final block, write a single detailed description of the musical style. 
         - **START THIS SECTION WITH THE HEADER: [STYLE_DESCRIPTION_SECTION]**
         - **DO NOT mention any artist names or band names in this description.**
         - Focus purely on the sonic characteristics, textures, dynamics, and atmosphere.
         - **STRICT LIMIT: MAXIMUM 1000 CHARACTERS.**
         - **DO NOT REPEAT THE SONG TEMPLATE HERE.**
      
      **CRITICAL:**
      - **ALWAYS use brackets for chords: [Am], [C], [G].**
      - **Strictly adhere to the provided template header values.**
      - **TOTAL OUTPUT MUST BE UNDER 3500 CHARACTERS.**
      `
      : `You are a professional music producer. Complete the template.
      - Fill in every placeholder.
      - Write original lyrics and chords.
      - **OPTIMIZE LENGTH:** Write detailed but concise notes.
      - **STRICT TOTAL LENGTH LIMIT: UNDER 3500 CHARACTERS.**
      - In the final block, write a single detailed description of the style. 
        - **START THIS SECTION WITH THE HEADER: [STYLE_DESCRIPTION_SECTION]**
        - **DO NOT mention any artist names or band names in this description.**
        - Focus purely on the sonic characteristics, textures, dynamics, and atmosphere.
        - **STRICT LIMIT: MAXIMUM 1000 CHARACTERS.**
        - **DO NOT REPEAT THE SONG TEMPLATE HERE.**
      - **ALWAYS use brackets for chords: [Am], [C], [G].**
      `;

    const prompt = `${promptContext}
    
    Ensure the output strictly follows this structure:
    1. Metadata Header (Title, Artist, Genre, Subgenre, World Music, Tempo, Key, Time Sig, Language, Duration, Emotions, Mood, Theme, Narrative, Rhyme, Metaphor, Hook)
    2. [Song Composition] (Intro paragraph + Lyrics & Chords + Detailed Production Notes)
    3. [STYLE_DESCRIPTION_SECTION] (followed by the text)
    
    ---
    ${fullTemplate}
    ---
    `;

    const generateConfig: any = {
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingBudget: thinkingBudget },
    };

    if (isSpecificSong) {
      // Enable Search for grounding/accuracy
      generateConfig.tools = [{googleSearch: {}}];
    }

    try {
      const response = await callWithRetry(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: generateConfig,
      }));

      const responseText = response.text.trim();

      // Extract sources if available
      if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
          const chunks = response.candidates[0].groundingMetadata.groundingChunks;
          const uniqueSources = chunks
              .map((chunk: any) => chunk.web?.uri)
              .filter((uri: string) => uri)
              .filter((value: string, index: number, self: string[]) => self.indexOf(value) === index);
          setSources(uniqueSources);
      }
      
      // Update parsing logic to look for the single Style Description block
      const summaryMarker = '[STYLE_DESCRIPTION_SECTION]';
      const summaryIndex = responseText.lastIndexOf(summaryMarker);

      if (summaryIndex !== -1) {
        const templateResult = responseText.substring(0, summaryIndex).trim();
        // Extract content AFTER the marker
        let summaryResult = responseText.substring(summaryIndex + summaryMarker.length).trim();
        
        // Cleanup if the AI added a colon (e.g. "[Style Description]:")
        if (summaryResult.startsWith(':')) {
            summaryResult = summaryResult.substring(1).trim();
        }

        setOutputBlocks([
          { title: "Generated Music Template", content: templateResult },
          { title: "Style Description", content: summaryResult },
        ]);
      } else if (responseText) {
        // Fallback if marker not found
        setOutputBlocks([
          { title: "Generated Music Template", content: responseText },
          { title: "Style Description", content: "Not generated properly." },
        ]);
      } else {
        setError("The AI generated an empty response. Please try again.");
      }
    } catch (e) {
      console.error(e);
      let errorMsg = "Failed to generate the music template. Please try adjusting your parameters.";
      
      const msg = (e.message || '').toString();
      if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
        errorMsg = "API Quota Exceeded. You have hit the rate limit. Please wait a moment and try again.";
      }
      
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateImages = async () => {
    setImageLoading(true);
    setImageError(null);
    setGeneratedImages([]); // Reset images at the beginning of the generation process

    try {
      let songDescription = `A visual representation of a song with the mood '${mood}' and theme '${theme}'.`; // Fallback
      if (outputBlocks.length > 0) {
        // Try to find the description in the blocks
        const summaryBlock = outputBlocks.find(b => b.title === "Style Description");
        if (summaryBlock) {
          songDescription = summaryBlock.content;
        }
      }

      const imagePrompt = `
        Generate a photorealistic image of a band named "${artistRef || 'an independent artist'}" performing their song titled "${songTitle || 'Untitled'}" live on stage.
        The band's appearance, instruments, stage lighting, and overall atmosphere must reflect the song's characteristics:
        - Genre: ${genre}
        - Mood: ${mood}
        - Artist Style Inspiration: ${artistRef || 'Modern pop/rock bands'}
        
        Detailed Visual Brief:
        ---
        ${songDescription}
        ---
        Capture a dynamic, high-energy action shot of the band members performing with passion.
      `;

      const maxImagesPerRequest = 4;
      let remainingImages = numberOfImages;
      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      while (remainingImages > 0) {
        const batchSize = Math.min(remainingImages, maxImagesPerRequest);

        const response = await callWithRetry(() => ai.models.generateImages({
          model: 'imagen-4.0-generate-001',
          prompt: imagePrompt,
          config: {
            numberOfImages: batchSize,
            outputMimeType: 'image/jpeg',
            aspectRatio: '16:9',
          },
        }), 3, 5000);

        const imageUrls = response.generatedImages.map(img => `data:image/jpeg;base64,${img.image.imageBytes}`);
        setGeneratedImages(prevImages => [...prevImages, ...imageUrls]);

        remainingImages -= batchSize;

        if (remainingImages > 0) {
          await sleep(10000); // Wait 10 seconds before the next batch to avoid rate limiting.
        }
      }

    } catch (e) {
      console.error(e);
      let errorMsg = `An error occurred while generating images: ${e.message}`;
      const msg = (e.message || '').toString();
      
      if (msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('resource_exhausted') || msg.includes('429')) {
        errorMsg = "You've exceeded the API quota. Please wait a moment before trying again, or try generating fewer images.";
      }
      setImageError(errorMsg);
    } finally {
      setImageLoading(false);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>Modular Song Architecture</h1>
        <div className="promo-banner">
          <svg className="promo-icon" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
          <div className="promo-text-content">
             <p>Create & Distribute Your Music</p>
             <a href="https://soundsky.com" target="_blank" rel="noopener noreferrer">Visit SoundSky.com &rarr;</a>
          </div>
        </div>
      </header>

      <main className="main-content">
        <section className="controls">
          <h2>Configuration</h2>
          
          <div className="form-group">
            <label>Song Title</label>
            <input 
              type="text" 
              value={songTitle} 
              onChange={(e) => setSongTitle(e.target.value)} 
              placeholder="e.g. Tiga Titik Hitam" 
            />
          </div>

          <div className="form-group">
            <label>Artist Reference / Style</label>
            <input 
              type="text" 
              value={artistRef} 
              onChange={(e) => setArtistRef(e.target.value)} 
              placeholder="e.g. Burgerkill" 
            />
          </div>

          <button 
            className="btn btn-secondary btn-full-width" 
            onClick={handleAssistantClick} 
            disabled={assistantLoading}
            style={{ marginBottom: '1.5rem' }}
          >
            {assistantLoading ? <div className="spinner small"></div> : "Suggest with AI"}
          </button>

          <div className="form-group">
            <label>Genre</label>
            <select value={genre} onChange={(e) => setGenre(e.target.value)}>
              {genreOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Subgenre</label>
            <select value={subgenre} onChange={(e) => setSubgenre(e.target.value)}>
              {subgenreOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>World Music Influence</label>
             <select value={worldMusic} onChange={(e) => setWorldMusic(e.target.value)}>
               <option value="None">None</option>
              {worldMusicOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Mood</label>
            <select value={mood} onChange={(e) => setMood(e.target.value)}>
              {moodOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Theme</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
               {themeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)} 
            </select>
          </div>

           <div className="form-group">
            <label>Tempo (BPM): {tempo}</label>
            <div className="tempo-control">
              <input 
                type="range" 
                min="40" 
                max="220" 
                value={tempo} 
                onChange={(e) => setTempo(parseInt(e.target.value))} 
              />
              <input 
                type="number" 
                min="40" 
                max="220" 
                value={tempo} 
                onChange={(e) => setTempo(parseInt(e.target.value))} 
              />
            </div>
          </div>

          <div className="form-group">
            <label>Key</label>
            <select value={key} onChange={(e) => setKey(e.target.value)}>
              {KEY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Time Signature</label>
            <select value={timeSignature} onChange={(e) => setTimeSignature(e.target.value)}>
              {TIME_SIGNATURE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

           <div className="form-group">
            <label>Lyric Language</label>
            <select value={lyricLanguage} onChange={(e) => setLyricLanguage(e.target.value)}>
              {LYRIC_LANGUAGE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

           <div className="form-group">
            <label>Duration</label>
            <div className="radio-group">
                <label>
                    <input 
                        type="radio" 
                        value="4" 
                        checked={duration === "4"} 
                        onChange={(e) => setDuration(e.target.value)} 
                    />
                    ~4 min (Radio)
                </label>
                <label>
                    <input 
                        type="radio" 
                        value="8" 
                        checked={duration === "8"} 
                        onChange={(e) => setDuration(e.target.value)} 
                    />
                    ~8 min (Epic)
                </label>
            </div>
          </div>

          <button className="btn btn-primary btn-full-width" onClick={handleGenerate} disabled={loading}>
            {loading ? <div className="spinner small"></div> : "Generate Template"}
          </button>
        </section>

        <section className="output">
          {error && <div className="error-message">{error}</div>}

          {loading && (
            <div className="spinner-wrapper">
              <div className="spinner"></div>
              <p>Composing song structure and lyrics...</p>
            </div>
          )}

          {!loading && outputBlocks.length === 0 && (
             <div className="placeholder">
               <p>Select options and click Generate to create a song template.</p>
             </div>
          )}

          {!loading && outputBlocks.length > 0 && (
            <div className="output-blocks-wrapper">
                
                {/* Visualizer Section */}
                <div className="output-block">
                    <h3>Audio Visualizer</h3>
                    <div className="visualizer-container">
                         <MusicVisualizer 
                            tempo={tempo} 
                            mood={mood} 
                            songTitle={songTitle} 
                            artistRef={artistRef} 
                         />
                    </div>
                     <div className="form-group">
                        <label>Upload Background Track (Optional)</label>
                         <input 
                            type="file" 
                            accept="audio/*" 
                            onChange={(e) => {
                                const file = e.target.files[0];
                                if(file) {
                                    setBackgroundTrack(file);
                                    if(backgroundTrackUrlRef.current) URL.revokeObjectURL(backgroundTrackUrlRef.current);
                                    const url = URL.createObjectURL(file);
                                    setBackgroundTrackUrl(url);
                                }
                            }} 
                         />
                         {backgroundTrack && <div className="file-name-display">{backgroundTrack.name}</div>}
                    </div>
                    {backgroundTrackUrl && (
                        <audio controls className="audio-player" src={backgroundTrackUrl} />
                    )}
                </div>

                {/* Text Blocks */}
                {outputBlocks.map((block, index) => (
                    <div key={index} className="output-block">
                        <h3>{block.title}</h3>
                        <button 
                            className="btn-copy"
                            onClick={() => navigator.clipboard.writeText(block.content)}
                        >
                            Copy
                        </button>
                        <pre>{block.content}</pre>
                        {block.title === "Generated Music Template" && sources.length > 0 && (
                             <div className="info-text" style={{textAlign: 'left', marginTop: '1rem', borderTop: '1px solid #333', paddingTop: '0.5rem'}}>
                                 <strong>Sources:</strong>
                                 <ul style={{paddingLeft: '1.5rem', marginTop: '0.5rem'}}>
                                     {sources.map((s, i) => (
                                         <li key={i}><a href={s} target="_blank" rel="noopener noreferrer" style={{color: '#03dac6'}}>{s}</a></li>
                                     ))}
                                 </ul>
                             </div>
                        )}
                    </div>
                ))}

                 {/* Image Generation */}
                 <div className="output-block image-gallery-block">
                    <h3>Band Imagery</h3>
                    
                    <div className="form-group">
                        <label>Number of Images: {numberOfImages}</label>
                        <div className="image-count-control">
                            <input 
                                type="range" 
                                min="1" 
                                max="4" 
                                value={numberOfImages} 
                                onChange={(e) => setNumberOfImages(parseInt(e.target.value))} 
                            />
                             <input 
                                type="number" 
                                min="1" 
                                max="4" 
                                value={numberOfImages} 
                                onChange={(e) => setNumberOfImages(parseInt(e.target.value))} 
                            />
                        </div>
                    </div>

                    <button 
                        className="btn btn-secondary btn-full-width" 
                        onClick={handleGenerateImages}
                        disabled={imageLoading}
                    >
                         {imageLoading ? <div className="spinner small"></div> : "Generate Images"}
                    </button>

                    {imageError && <div className="error-message" style={{marginTop: '1rem'}}>{imageError}</div>}
                    
                    <div className="image-gallery-grid" style={{marginTop: '1.5rem'}}>
                        {generatedImages.map((src, index) => (
                            <div key={index} className="generated-image-container">
                                <img src={src} alt={`Generated Band ${index + 1}`} className="generated-image" />
                            </div>
                        ))}
                    </div>
                 </div>

            </div>
          )}
        </section>
      </main>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);