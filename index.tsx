import { GoogleGenAI, Type } from "@google/genai";
import React, { useState, useCallback, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Helper: Robust JSON Extractor ---
const extractJSON = (text: string) => {
  try {
    if (!text) return null;
    // Regex to capture the first valid JSON object structure
    const match = text.match(/(\{[\s\S]*\})/);
    if (match && match[0]) {
      return JSON.parse(match[0]);
    }
    return null;
  } catch (e) {
    console.warn("JSON Extraction Failed:", e);
    return null;
  }
};

// --- Helper for Retry Logic (Exponential Backoff) ---
const callWithRetry = async (apiCall: () => Promise<any>, retries = 3, baseDelay = 2000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await apiCall();
        } catch (error: any) {
             const errStr = typeof error === 'string' ? error : (error?.message || JSON.stringify(error) || "");
             console.warn(`API call failed (Attempt ${i + 1}/${retries}):`, errStr);
             // If error is 429 (Quota) or 403 (Permission Denied), stop retrying immediately to failover
             if (errStr.includes("429") || errStr.includes("quota") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("403") || errStr.includes("PERMISSION_DENIED") || error?.status === 403 || error?.status === 429 || error?.code === 429 || error?.status === 'RESOURCE_EXHAUSTED') {
                 throw error;
             }
             // Check for 503 (Service Unavailable)
             if (i < retries - 1) {
                const delay = baseDelay * Math.pow(2, i) + (Math.random() * 500);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
             }
             throw error;
        }
    }
};

const generateWithFallback = async (prompt: string, useSearch: boolean, systemInstruction?: string, temperature: number = 0.7) => {
    let currentUseSearch = useSearch;
    
    const doCall = async (model: string) => {
        try {
            const config: any = {
                maxOutputTokens: 8192,
                temperature,
                systemInstruction,
            };
            if (currentUseSearch) {
                config.tools = [{ googleSearch: {} }];
            }
            
            return await callWithRetry(() => ai.models.generateContent({
                model,
                contents: prompt,
                config
            }));
        } catch (e: any) {
            const errStr = typeof e === 'string' ? e : (e?.message || JSON.stringify(e) || "");
            if (currentUseSearch && (errStr.includes("403") || errStr.includes("PERMISSION_DENIED") || e?.status === 403)) {
                console.warn(`403 Permission Denied with Google Search on ${model}. Retrying without search.`);
                currentUseSearch = false; // Turn off search for this model and future fallbacks
                
                const fallbackConfig: any = {
                    maxOutputTokens: 8192,
                    temperature,
                    systemInstruction,
                };
                
                return await callWithRetry(() => ai.models.generateContent({
                    model,
                    contents: prompt,
                    config: fallbackConfig
                }));
            }
            throw e;
        }
    };

    try {
        return await doCall('gemini-3.1-pro-preview');
    } catch (e: any) {
        const errStr = typeof e === 'string' ? e : (e?.message || JSON.stringify(e) || "");
        if (errStr.includes('429') || errStr.includes('quota') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('403') || errStr.includes('PERMISSION_DENIED') || errStr.includes('404') || errStr.includes('not found')) {
             console.warn("Pro model failed with quota, permission, or existence error. Falling back to flash.");
             try {
                return await doCall('gemini-3.5-flash');
             } catch (e2: any) {
                const errStr2 = typeof e2 === 'string' ? e2 : (e2?.message || JSON.stringify(e2) || "");
                if (errStr2.includes('429') || errStr2.includes('quota') || errStr2.includes('RESOURCE_EXHAUSTED') || errStr2.includes('403') || errStr2.includes('PERMISSION_DENIED') || errStr2.includes('404') || errStr2.includes('not found')) {
                     console.warn("Flash model failed. Falling back to flash-lite.");
                     return await doCall('gemini-3.1-flash-lite');
                }
                throw e2;
             }
        }
        throw e;
    }
};

// --- Custom Hook for Local Storage Persistence ---
function useLocalStorage<T>(key: string, initialValue: T) {
  // State to store our value
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    try {
      // Get from local storage by key
      const item = window.localStorage.getItem(key);
      // Parse stored json or if none return initialValue
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Return a wrapped version of useState's setter function that ...
  // ... persists the new value to localStorage.
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;
      // Save state
      setStoredValue(valueToStore);
      // Save to local storage
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  };
  return [storedValue, setValue] as const;
}

// --- DATA CONSTANTS (MASSIVE INTERNATIONAL TERMINOLOGY) ---
const INITIAL_GENRE_OPTIONS = [
  "A cappella", "Acid", "Acoustic", "African", "Alternative", "Ambient", "Americana", "Anime", "Asian", "Avant-Garde", 
  "Ballad", "Bass", "Blues", "Brazilian", "Breakbeat", "Cabaret", "Caribbean", "Celtic", "Chanson", "Children's", 
  "Chillout", "Christian", "Classical", "Comedy", "Country", "Dance", "Dancehall", "Disco", "Downtempo", "Drum & Bass", 
  "Dub", "Dubstep", "Easy Listening", "Electronic", "Enka", "Eurodance", "Experimental", "Folk", "Funk", "Fusion", 
  "Garage", "Glam", "Gospel", "Goth", "Grime", "Grunge", "Hardcore", "Heavy Metal", "Hip Hop", "Holiday", "House", 
  "Idol", "Indian", "Indie", "Industrial", "Instrumental", "J-Pop", "Jazz", "Jungle", "K-Pop", "Latin", "Lo-Fi", 
  "Lounge", "Metal", "Musical Theatre", "New Age", "New Wave", "Noise", "Opera", "Orchestral", "Pop", "Post-Punk", 
  "Progressive", "Psychedelic", "Punk", "R&B", "Rap", "Reggae", "Reggaeton", "Rock", "Rock & Roll", "Roots", "Ska", 
  "Soul", "Soundtrack", "Spoken Word", "Swing", "Synth-Pop", "Techno", "Trance", "Trap", "Trip-Hop", "Vocal", 
  "World", "Worship"
];

// Comprehensive list approximating international standards (~1000+ items compacted)
const INITIAL_SUBGENRE_OPTIONS = [
  "2-Step Garage", "2-Tone", "4-Beat", "Abstract Hip Hop", "Acid Breaks", "Acid House", "Acid Jazz", "Acid Rock", "Acid Techno", "Acid Trance", 
  "Acoustic Blues", "Acoustic Rock", "Adult Alternative", "Adult Contemporary", "Afro-Beat", "Afro-Cuban", "Afro-House", "Afro-Jazz", "Afro-Pop", "Afro-Punk", "Afro-Soul", "Afrobeat",
  "Aggrotech", "Alternative Country", "Alternative Dance", "Alternative Folk", "Alternative Hip Hop", "Alternative Metal", "Alternative R&B", "Alternative Rock", "Amapiano", 
  "Ambient", "Ambient Dub", "Ambient House", "Ambient Techno", "Americana", "Anarcho-Punk", "Andean Music", "Anime Song", "Anti-Folk", "Apala", "Arab Pop", 
  "Arena Rock", "Art Pop", "Art Punk", "Art Rock", "Asian Underground", "Atmospheric Black Metal", "Atmospheric Drum & Bass", "Austropop", "Avant-Garde", "Avant-Garde Jazz", 
  "Avant-Garde Metal", "Axé", "Bachata", "Baile Funk", "Bakersfield Sound", "Balearic Beat", "Ballad", "Ballroom", "Baltimore Club", "Barbershop", "Baroque", 
  "Baroque Pop", "Bass House", "Bass Music", "Bassline", "Bebop", "Bedroom Pop", "Bhangra", "Big Band", "Big Beat", "Bitpop", "Black Metal", "Blue-Eyed Soul", 
  "Bluegrass", "Blues", "Blues Rock", "Bolero", "Bollywood", "Boogie", "Boogie-Woogie", "Boom Bap", "Bossa Nova", "Bounce", "Brass Band", "Brazilian Bass", 
  "Brazilian Funk", "Brazilian Jazz", "Breakbeat", "Breakbeat Hardcore", "Breakcore", "Breaks", "Britpop", "Broken Beat", "Brostep", "Bubblegum Bass", "Bubblegum Pop", 
  "C-Pop", "Cajun", "Calypso", "Campursari", "Canterbury Scene", "Cantopop", "Cape Jazz", "Carnatic", "Celtic", "Celtic Fusion", "Celtic Metal", "Celtic Punk", 
  "Celtic Rock", "Chamber Jazz", "Chamber Music", "Chamber Pop", "Champeta", "Changüí", "Chanson", "Chicago Blues", "Chicago House", "Chicago Soul", "Chicano Rap", 
  "Children's Music", "Chill-out", "Chillhop", "Chillwave", "Chimurenga", "Chiptune", "Chopped and Screwed", "Christian Hip Hop", "Christian Metal", "Christian Rock", 
  "Christmas", "Chutney", "City Pop", "Classic Blues", "Classic Country", "Classic Rock", "Classical", "Classical Crossover", "Close Harmony", "Cloud Rap", "Club", 
  "Coldwave", "Comedy", "Compas", "Complextro", "Concerto", "Conscious Hip Hop", "Contemporary Christian", "Contemporary Classical", "Contemporary Country", 
  "Contemporary Folk", "Contemporary Gospel", "Contemporary Jazz", "Contemporary R&B", "Cool Jazz", "Corrido", "Country", "Country Blues", "Country Folk", "Country Pop", 
  "Country Rap", "Country Rock", "Coupé-Décalé", "Cowpunk", "Crunk", "Crunkcore", "Crust Punk", "Cumbia", "Cyberpunk", "D-Beat", "Dance", "Dance-Pop", "Dance-Punk", 
  "Dance-Rock", "Dancehall", "Dangdut", "Dangdut Koplo", "Dark Ambient", "Dark Cabaret", "Dark Electro", "Dark Folk", "Dark Wave", "Darkstep", "Death Industrial", 
  "Death Metal", "Death 'n' Roll", "Deathcore", "Deathrock", "Deep Funk", "Deep House", "Deep Soul", "Deep Techno", "Delta Blues", "Desert Rock", "Detroit Blues", 
  "Detroit Techno", "Digital Hardcore", "Dirty South", "Disco", "Disco Polo", "Diva House", "Dixieland", "Djent", "Doom Metal", "Doo-Wop", "Downtempo", "Dream Pop", 
  "Dream Trance", "Drill", "Drill 'n' Bass", "Drone", "Drone Metal", "Drum and Bass", "Drumstep", "Dub", "Dub Poetry", "Dub Techno", "Dubstep", "Dungeon Synth", 
  "EBM", "Early Music", "East Coast Hip Hop", "Easy Listening", "Electric Blues", "Electric Folk", "Electro", "Electro House", "Electro-Funk", "Electro-Industrial", 
  "Electro-Pop", "Electro-Swing", "Electroclash", "Electronic Body Music", "Electronic Rock", "Electronica", "Electronicore", "Electropunk", "Emo", "Emo Pop", 
  "Emo Rap", "Enka", "Environmental", "Ethereal Wave", "Euro-Disco", "Euro-Trance", "Eurobeat", "Eurodance", "Europop", "Experimental", "Experimental Hip Hop", 
  "Experimental Rock", "Fado", "Fidget House", "Field Recording", "Filk", "Film Score", "Flamenco", "Folk", "Folk Metal", "Folk Pop", "Folk Punk", "Folk Rock", 
  "Folktronica", "Footwork", "Forró", "Free Folk", "Free Improvisation", "Free Jazz", "Freestyle", "French House", "French Pop", "Freak Folk", "Funk", "Funk Carioca", 
  "Funk Metal", "Funk Rock", "Funk Soul", "Funky House", "Fusion", "Future Bass", "Future Funk", "Future Garage", "Future House", "Future Pop", "Future Rave", 
  "G-Funk", "Gabber", "Gagaku", "Gamelan", "Gangsta Rap", "Garage", "Garage House", "Garage Punk", "Garage Rock", "Ghetto House", "Ghettotech", "Ghost Productions", 
  "Glam Metal", "Glam Rock", "Glitch", "Glitch Hop", "Glitch Pop", "Go-Go", "Goa Trance", "Goregrind", "Gospel", "Gothic Metal", "Gothic Rock", "Grebo", 
  "Gregorian Chant", "Grime", "Grindcore", "Groove Metal", "Grunge", "Guajira", "Gypsy Jazz", "Gypsy Punk", "Halling", "Happy Hardcore", "Hard Bop", "Hard House", 
  "Hard Nrg", "Hard Rock", "Hard Trance", "Hardbag", "Hardcore", "Hardcore Hip Hop", "Hardcore Punk", "Hardcore Techno", "Hardstyle", "Harsh Noise", "Heartland Rock", 
  "Heavy Metal", "Hi-NRG", "Highlife", "Hill Country Blues", "Hindustani", "Hip House", "Hip Hop", "Hip Hop Soul", "Honky Tonk", "Horror Punk", "Horrorcore", 
  "House", "Huayno", "Hyphy", "Hyperpop", "IDM", "Illbient", "Impressionist", "Indie Folk", "Indie Pop", "Indie Rock", "Indietronica", "Industrial", "Industrial Hip Hop", 
  "Industrial Metal", "Industrial Musical", "Industrial Rock", "Industrial Techno", "Instrumental", "Instrumental Hip Hop", "Instrumental Rock", "Irish Folk", "Italo Dance", 
  "Italo Disco", "Italo House", "J-Core", "J-Pop", "J-Rock", "J-Synth", "Jackin House", "Jam Band", "Jangle Pop", "Japanese City Pop", "Jazz", "Jazz Blues", 
  "Jazz Funk", "Jazz Fusion", "Jazz House", "Jazz Rap", "Jazz Rock", "Jersey Club", "Jit", "Juke", "Jump Blues", "Jumpstyle", "Jungle", "K-Pop", "K-R&B", "K-Rap", 
  "K-Rock", "Kabuki", "Kawaii Future Bass", "Kawaii Metal", "Kayōkyoku", "Kizomba", "Klezmer", "Kompa", "Krautrock", "Kroncong", "Kuduro", "Kulintang", "Kwaito", 
  "Laiko", "Latin", "Latin Alternative", "Latin Ballad", "Latin Christian", "Latin House", "Latin Jazz", "Latin Metal", "Latin Pop", "Latin Rock", "Latin Soul", 
  "Latin Trap", "Leftfield", "Levenslied", "Liquid Drum and Bass", "Liquid Funk", "Lo-Fi", "Lo-Fi Hip Hop", "Lo-Fi House", "Long-Form", "Lounge", "Lovers Rock", 
  "Low Bap", "Luk Thung", "Madchester", "Mainstream Jazz", "Makossa", "Malayalam", "Mambo", "Mandopop", "Manele", "March", "Mariachi", "Martial Industrial", "Mashup", 
  "Math Rock", "Mathcore", "Mbalax", "Medieval", "Meditation", "Melbourne Bounce", "Melodic Black Metal", "Melodic Death Metal", "Melodic Dubstep", "Melodic Hardcore", 
  "Melodic House", "Melodic Metalcore", "Melodic Techno", "Melodic Trance", "Memphis Blues", "Memphis Soul", "Merengue", "Metal", "Metalcore", "Miami Bass", "Microhouse", 
  "Middle of the Road", "Minimal", "Minimal House", "Minimal Techno", "Minimal Wave", "Minimalism", "Min'yo", "Modal Jazz", "Modern Blues", "Modern Classical", 
  "Modern Country", "Modern Rock", "Moombahton", "Moombahcore", "Motown", "MPB", "Murga", "Music Hall", "Musique Concrète", "Nashville Sound", "Native American", 
  "Neoclassical", "Neoclassical Darkwave", "Neoclassical Metal", "Neoclassical New Age", "Neo-Folk", "Neo-Psychedelia", "Neo-Soul", "Neo-Trad", "Nerdcore", 
  "Neue Deutsche Härte", "Neurofunk", "New Age", "New Beat", "New Jack Swing", "New Orleans Blues", "New Orleans Jazz", "New Rave", "New School Hip Hop", "New Wave", 
  "Nintendocore", "No Wave", "Noise", "Noise Pop", "Noise Rock", "Nordic Folk", "Norteño", "Northern Soul", "Nu-Disco", "Nu-Funk", "Nu-Gaze", "Nu-Jazz", "Nu-Metal", 
  "Nu-Skool Breaks", "Nueva Canción", "Occult Rock", "Oi!", "Old School Hip Hop", "Old Time", "Opera", "Orchestral", "Orchestral Pop", "Organic House", "Outlaw Country", 
  "Outsider Music", "P-Funk", "Pagan Folk", "Pagan Metal", "Paisley Underground", "Palm Wine", "Pan-African", "Pansori", "Party", "Peace Punk", "Philly Soul", 
  "Phonk", "Piano Blues", "Piano Rock", "Piedmont Blues", "Pipe Band", "Plunderphonics", "Polka", "Pop", "Pop Folk", "Pop Metal", "Pop Punk", "Pop Rap", "Pop Rock", 
  "Pop Soul", "Pornogrind", "Post-Bop", "Post-Classical", "Post-Disco", "Post-Grunge", "Post-Hardcore", "Post-Industrial", "Post-Metal", "Post-Minimalism", "Post-Punk", 
  "Post-Punk Revival", "Post-Rock", "Power Electronics", "Power Metal", "Power Noise", "Power Pop", "Powerviolence", "Progressive Bluegrass", "Progressive Country", 
  "Progressive Electronic", "Progressive Folk", "Progressive House", "Progressive Metal", "Progressive Pop", "Progressive Rock", "Progressive Soul", "Progressive Trance", 
  "Proto-Punk", "Psychedelic", "Psychedelic Folk", "Psychedelic Pop", "Psychedelic Rock", "Psychedelic Soul", "Psychedelic Trance", "Psychobilly", "Pub Rock", "Punk", 
  "Punk Blues", "Punk Jazz", "Punk Rock", "Qawwali", "Queercore", "Quiet Storm", "R&B", "Raï", "Ragga", "Ragga Jungle", "Raggacore", "Ragtime", "Ranchera", "Rap", 
  "Rap Metal", "Rap Rock", "Rapcore", "Rare Groove", "Rave", "Rebetiko", "Red Dirt", "Reggae", "Reggae Fusion", "Reggae Rock", "Reggaeton", "Regional Mexican", 
  "Renaissance", "Retro", "Retro-Soul", "Retrowave", "Rhythm and Blues", "Riddim", "Riot Grrrl", "Rock", "Rock and Roll", "Rock en Español", "Rockabilly", "Rocksteady", 
  "Romani", "Romantic", "Roots Reggae", "Roots Rock", "Rumba", "Russian Chanson", "Russian Pop", "Salsa", "Samba", "Samba-Rock", "Schlager", "Score", "Screamo", 
  "Sea Shanty", "Seapunk", "Second Wave Emo", "Sega", "Semba", "Serialism", "Sertanejo", "Shibuya-Kei", "Shoegaze", "Show Tune", "Singer-Songwriter", "Ska", "Ska Punk", 
  "Skate Punk", "Skiffle", "Skullstep", "Slowcore", "Sludge Metal", "Smooth Jazz", "Soca", "Soft Rock", "Son Cubano", "Son Montuno", "Sophisti-Pop", "Soukous", "Soul", 
  "Soul Blues", "Soul Jazz", "Sound Art", "Soundtrack", "Southern Hip Hop", "Southern Rock", "Southern Soul", "Space Age Pop", "Space Disco", "Space Rock", "Spectralism", 
  "Speed Garage", "Speed Metal", "Speedcore", "Spiritual Jazz", "Spoken Word", "Stoner Metal", "Stoner Rock", "Street Punk", "Stride", "String Quartet", "Surf Music", 
  "Surf Rock", "Swamp Blues", "Swamp Pop", "Swamp Rock", "Swing", "Symphonic Black Metal", "Symphonic Metal", "Symphonic Poem", "Symphonic Rock", "Synth-Pop", 
  "Synth-Punk", "Synthwave", "T-Pop", "Taarab", "Tango", "Tech House", "Tech Trance", "Technical Death Metal", "Techno", "Teen Pop", "Tejano", "Terrorcore", "Tex-Mex", 
  "Texas Blues", "Third Stream", "Thrash Metal", "Throat Singing", "Timba", "Tishoumaren", "Traditional Country", "Traditional Folk", "Traditional Pop", "Trance", "Trap", 
  "Trap Metal", "Tribal House", "Trip-Hop", "Tropical House", "Tropicalia", "Trot", "Truck Driving Country", "Turbo-Folk", "Turntablism", "Twee Pop", "Twist", "UK Bass", 
  "UK Drill", "UK Funky", "UK Garage", "UK Hardcore", "Underground Hip Hop", "Uplifting Trance", "Urban Contemporary", "Vallenato", "Vaporwave", "Vaudeville", 
  "Viking Metal", "Visual Kei", "Vocal House", "Vocal Jazz", "Vocal Pop", "Vocal Trance", "Vocaloid", "Volksmusik", "Waltz", "War Metal", "West Coast Blues", 
  "West Coast Hip Hop", "West Coast Jazz", "Western Swing", "Witch House", "Wonky", "Work Song", "World", "World Fusion", "Worldbeat", "Yacht Rock", "Yé-Yé", 
  "Zamrock", "Zolo", "Zouk", "Zydeco"
];

const MOOD_OPTIONS = [
  "Aggressive", "Angry", "Anthemic", "Anxious", "Atmospheric", "Bittersweet", "Bouncy", "Brooding", "Calm", 
  "Celebratory", "Chaotic", "Chill", "Cinematic", "Cold", "Complex", "Confident", "Dark", "Depressing", 
  "Detached", "Dramatic", "Dreamy", "Eccentric", "Ecstatic", "Eerie", "Emotional", "Energetic", "Enigmatic", 
  "Epic", "Ethereal", "Euphoric", "Excited", "Fierce", "Funky", "Futuristic", "Gentle", "Gloomy", "Gothic", 
  "Groovy", "Happy", "Harsh", "Haunting", "Heavy", "Heroic", "Hopeful", "Humorous", "Hypnotic", "Industrial", 
  "Intense", "Intimate", "Joyful", "Laid Back", "Light", "Lonely", "Lush", "Majestic", "Manic", "Meditative", 
  "Melancholic", "Mellow", "Menacing", "Minimalist", "Motivational", "Mysterious", "Nostalgic", "Ominous", 
  "Party", "Passion", "Peaceful", "Playful", "Poignant", "Powerful", "Psychedelic", "Quirky", "Rebellious", 
  "Reflective", "Relaxed", "Romantic", "Rowdy", "Sad", "Sarcastic", "Scary", "Sentimental", "Serene", 
  "Sensual", "Sexy", "Silly", "Soothing", "Sophisticated", "Sorrowful", "Spacey", "Spiritual", "Spooky", 
  "Stomp", "Strange", "Strong", "Summer", "Surreal", "Suspenseful", "Sweet", "Technical", "Tense", 
  "Thoughtful", "Touching", "Trippy", "Triumphant", "Uplifting", "Urgent", "Warm", "Whimsical", "Wild"
];

const THEME_OPTIONS = [
  "Activism", "Addiction", "Adrenaline", "Adventure", "Alienation", "Ambition", "Anger", "Anxiety", 
  "Apocalypse", "Beauty", "Betrayal", "Celebration", "Chaos", "Childhood", "Comedy", "Coming of Age", 
  "Conflict", "Conspiracy", "Corruption", "Courage", "Crime", "Culture", "Cyberpunk", "Dance", "Death", 
  "Depression", "Desire", "Destiny", "Dreams", "Drugs", "Dystopia", "Empowerment", "Equality", 
  "Escapism", "Existentialism", "Faith", "Fame", "Family", "Fantasy", "Fear", "Feminism", "Freedom", 
  "Friendship", "Future", "Ghosts/Supernatural", "Glory", "Grief", "Growth", "Happiness", "Hate", 
  "Heartbreak", "Hedonism", "Heroism", "History", "Home", "Hope", "Humanity", "Identity", "Immortality", 
  "Innocence", "Insanity", "Inspiration", "Introspection", "Isolation", "Jealousy", "Journey", "Justice", 
  "Life", "Loneliness", "Loss", "Love", "Lust", "Magic", "Materialism", "Memories", "Mental Health", 
  "Money", "Mortality", "Mystery", "Mythology", "Nature", "Nightlife", "Nostalgia", "Occult", "Pain", 
  "Paranoia", "Party", "Passion", "Past", "Patriotism", "Peace", "Perseverance", "Philosophy", "Politics", 
  "Poverty", "Power", "Pride", "Protest", "Rebellion", "Redemption", "Regret", "Relationship", "Religion", 
  "Resilience", "Resistance", "Revenge", "Revolution", "Road Trip", "Romance", "Sacrifice", "Satire", 
  "Sci-Fi", "Science", "Secrets", "Self-Discovery", "Self-Love", "Sex", "Social Commentary", "Social Justice", 
  "Society", "Solitude", "Sorrow", "Space", "Spirituality", "Sports", "Storytelling", "Strength", "Struggle", 
  "Success", "Suicide", "Summer", "Survival", "Technology", "Time", "Tragedy", "Transformation", "Trauma", 
  "Travel", "Trust", "Unity", "Violence", "War", "Wealth", "Winter", "Work", "Youth"
];

const INITIAL_WORLD_MUSIC_OPTIONS = [
  "Aboriginal", "Afro-Cuban", "Afrobeat", "Andean", "Arabic", "Balkan", "Bossa Nova", "Cajun", "Calypso", "Carnatic", 
  "Celtic", "Chinese Traditional", "Dangdut", "Flamenco", "Gamelan", "Gnawa", "Gospel", "Hawaiian", "Hindustani", 
  "Indian Classical", "Indonesian", "Inuit", "Japanese Traditional", "Klezmer", "Latin", "Maori", "Mariachi", 
  "Middle Eastern", "Mongolian Throat Singing", "Native American", "Nordic Folk", "Persian", "Polynesian", "Qawwali", 
  "Raga", "Reggae", "Samba", "Soca", "Sufi", "Taiko", "Tango", "Tibetan", "Turkish", "West African", "Zydeco"
];

const KEY_OPTIONS = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];
const TIME_SIGNATURE_OPTIONS = ["4/4", "3/4", "6/8", "2/4", "5/4", "7/4", "7/8", "9/8", "12/8", "Free Time"];
const LYRIC_LANGUAGE_OPTIONS = ["Indonesian", "English", "Javanese", "Sundanese", "Spanish", "Japanese", "Korean", "Mandarin", "Arabic", "French", "German", "Mixed"];

// --- Optimized MultiSelect Component (Unlimited Selection) ---
const MultiSelect = ({ label, options = [], selected = [], onChange }: { label: string, options: string[], selected: string[], onChange: (val: string[]) => void }) => {
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Sanitization: Ensure options is a valid string array.
  const safeOptions = React.useMemo(() => {
      if (!Array.isArray(options)) return [];
      // If selected items are not in options (added via AI), append them so they are visible/selectable
      const combined = [...new Set([...options, ...selected])].sort();
      return combined.filter(opt => typeof opt === 'string' && opt.trim().length > 0);
  }, [options, selected]);

  const toggle = (opt: string) => {
    if (!opt) return;
    if (selected.includes(opt)) {
      onChange(selected.filter(s => s !== opt));
    } else {
      // UNLIMITED SELECTION: Removed the limit check
      onChange([...selected, opt]);
    }
  };

  const filteredOptions = safeOptions.filter(opt => opt.toLowerCase().includes(filter.toLowerCase()));
  
  // Performance hack: Only render top 20 items initially to prevent mobile DOM freeze
  const visibleOptions = showAll || filter.length > 0 ? filteredOptions : filteredOptions.slice(0, 20);
  const hiddenCount = filteredOptions.length - visibleOptions.length;

  return (
    <div className="form-group">
      <div className="label-row">
        <label>{label}</label>
        <span className="count-badge">{selected.length} selected</span>
      </div>
      
      <input 
        type="text" 
        className="filter-input"
        placeholder={`Search ${label.split('(')[0].trim()}...`} 
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{marginBottom: '0.8rem', fontSize: '0.9rem', padding: '0.6rem'}}
      />

      <div className="chip-grid">
        {visibleOptions.map((opt, idx) => (
          <button
            key={`${idx}-${opt}`} 
            className={`chip ${selected.includes(opt) ? 'selected' : ''}`}
            onClick={() => toggle(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
      
      {!showAll && filter.length === 0 && hiddenCount > 0 && (
        <button className="btn-text" onClick={() => setShowAll(true)}>
          + Show {hiddenCount} more
        </button>
      )}
      {showAll && filter.length === 0 && (
         <button className="btn-text" onClick={() => setShowAll(false)}>
          Show less
        </button>
      )}
    </div>
  );
};

const App = () => {
  // --- PERSISTENT STATE USING LOCAL STORAGE ---
  const [genreOptions, setGenreOptions] = useLocalStorage("genreOptions", INITIAL_GENRE_OPTIONS);
  const [subgenreOptions, setSubgenreOptions] = useLocalStorage("subgenreOptions", INITIAL_SUBGENRE_OPTIONS);
  const [worldMusicOptions, setWorldMusicOptions] = useLocalStorage("worldMusicOptions", INITIAL_WORLD_MUSIC_OPTIONS);
  const [moodOptions, setMoodOptions] = useLocalStorage("moodOptions", MOOD_OPTIONS);
  const [themeOptions, setThemeOptions] = useLocalStorage("themeOptions", THEME_OPTIONS);

  const [genres, setGenres] = useLocalStorage<string[]>("selectedGenres", []);
  const [subgenres, setSubgenres] = useLocalStorage<string[]>("selectedSubgenres", []);
  const [worldMusicInfluences, setWorldMusicInfluences] = useLocalStorage<string[]>("selectedWorldMusic", []);
  const [moods, setMoods] = useLocalStorage<string[]>("selectedMoods", []);
  const [themes, setThemes] = useLocalStorage<string[]>("selectedThemes", []);

  const [lyricLanguage, setLyricLanguage] = useLocalStorage("lyricLanguage", LYRIC_LANGUAGE_OPTIONS[0]);
  const [duration, setDuration] = useLocalStorage("duration", "4:00");
  const [songTitle, setSongTitle] = useLocalStorage("songTitle", "");
  const [artistRef, setArtistRef] = useLocalStorage("artistRef", "");
  const [vocalStyleInput, setVocalStyleInput] = useLocalStorage("vocalStyleInput", "");
  const [productionAesthetic, setProductionAesthetic] = useLocalStorage("productionAesthetic", "");
  const [rhythmicFeel, setRhythmicFeel] = useLocalStorage("rhythmicFeel", "");
  const [harmonicProfile, setHarmonicProfile] = useLocalStorage("harmonicProfile", "");
  const [tempo, setTempo] = useLocalStorage("tempo", 120);
  const [key, setKey] = useLocalStorage("key", KEY_OPTIONS[0]);
  const [timeSignature, setTimeSignature] = useLocalStorage("timeSignature", TIME_SIGNATURE_OPTIONS[0]);
  const [lyricType, setLyricType] = useLocalStorage("lyricType", "original");

  const [outputBlocks, setOutputBlocks] = useLocalStorage<any[]>("outputBlocks", []);
  const [sources, setSources] = useLocalStorage<string[]>("sources", []);

  const [loading, setLoading] = useState(false);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = () => {
    localStorage.clear();
    setGenreOptions(INITIAL_GENRE_OPTIONS);
    setSubgenreOptions(INITIAL_SUBGENRE_OPTIONS);
    setWorldMusicOptions(INITIAL_WORLD_MUSIC_OPTIONS);
    setMoodOptions(MOOD_OPTIONS);
    setThemeOptions(THEME_OPTIONS);

    setGenres([]);
    setSubgenres([]);
    setWorldMusicInfluences([]);
    setMoods([]);
    setThemes([]);

    setLyricLanguage(LYRIC_LANGUAGE_OPTIONS[0]);
    setDuration("4");
    setSongTitle("");
    setArtistRef("");
    setVocalStyleInput("");
    setProductionAesthetic("");
    setRhythmicFeel("");
    setHarmonicProfile("");
    setTempo(120);
    setKey(KEY_OPTIONS[0]);
    setTimeSignature(TIME_SIGNATURE_OPTIONS[0]);
    
    setOutputBlocks([]);
    setSources([]);
    setError(null);
  };

  // --- Helper to safely update state from AI suggestions ---
  const applySuggestions = (suggestions: any) => {
      const sanitize = (arr: any) => {
          if (!Array.isArray(arr)) return typeof arr === 'string' ? [arr] : [];
          return arr.filter(item => typeof item === 'string' && item.trim().length > 0);
      };

      // Helper to DYNAMICALLY add new unique items to options and select them
      const updateSelection = (
          newItems: string[], 
          currentOptions: string[], 
          setOptions: (val: string[]) => void, 
          setSelected: (val: string[]) => void
      ) => {
          if (newItems.length > 0) {
              // SYNCHRONIZATION FIX: Combine existing options with new AI findings
              // This ensures highly specific experimental genres found by AI are not filtered out
              const combinedOptions = Array.from(new Set([...currentOptions, ...newItems])).sort();
              setOptions(combinedOptions); 
              setSelected(newItems);
          }
      };

      if (suggestions.genre) updateSelection(sanitize(suggestions.genre), genreOptions, setGenreOptions, setGenres);
      if (suggestions.subgenre) updateSelection(sanitize(suggestions.subgenre), subgenreOptions, setSubgenreOptions, setSubgenres);
      if (suggestions.worldMusic) updateSelection(sanitize(suggestions.worldMusic), worldMusicOptions, setWorldMusicOptions, setWorldMusicInfluences);
      if (suggestions.moods) updateSelection(sanitize(suggestions.moods), moodOptions, setMoodOptions, setMoods);
      if (suggestions.themes) updateSelection(sanitize(suggestions.themes), themeOptions, setThemeOptions, setThemes);

      if (suggestions.tempo) {
          const t = parseInt(suggestions.tempo);
          if (!isNaN(t) && t >= 40 && t <= 220) setTempo(t);
      }
      if (suggestions.key) {
          const k = KEY_OPTIONS.find(opt => suggestions.key.includes(opt));
          if (k) setKey(k);
      }
      if (suggestions.timeSignature && TIME_SIGNATURE_OPTIONS.includes(suggestions.timeSignature)) {
          setTimeSignature(suggestions.timeSignature);
      }
      if (suggestions.lyricLanguage) {
          const l = LYRIC_LANGUAGE_OPTIONS.find(opt => suggestions.lyricLanguage.toLowerCase().includes(opt.toLowerCase()));
          if (l) setLyricLanguage(l);
      }
      if (suggestions.durationString) {
          setDuration(suggestions.durationString);
      }
      if (suggestions.vocalStyle) setVocalStyleInput(suggestions.vocalStyle);
      if (suggestions.productionAesthetic) setProductionAesthetic(suggestions.productionAesthetic);
      if (suggestions.rhythmicFeel) setRhythmicFeel(suggestions.rhythmicFeel);
      if (suggestions.harmonicProfile) setHarmonicProfile(suggestions.harmonicProfile);
  };

  const handleAssistantClick = async () => {
    if (!songTitle.trim() && !artistRef.trim()) {
      setError("Silakan masukkan Judul Lagu atau Target Artis/Band/Album terlebih dahulu (harus diinput manual).");
      return;
    }
    
    setAssistantLoading(true);
    setError(null);
    try {
      const isSpecificSong = songTitle.trim().length > 0;
      
      const prompt = `Role: Elite Music Data Analyst & Ethnomusicologist.
      Target: Perform a deep metadata analysis for the track titled "${songTitle}"${artistRef ? ` arranged in the musical style of "${artistRef}"` : ""}.
      
      OBJECTIVE: High accuracy on metadata by cross-referencing industry databases.

      INSTRUCTIONS:
      1. ORIGINAL SONG IDENTIFICATION: Use Google Search to find the exact original song titled "${songTitle}". If the song title is famous in a specific country/culture, figure out the most iconic song that matches. Identify its true original artist, precise original genre, original duration, BPM, key, and themes. If the Target Style ("${artistRef}") contains a mashup or mentions the original artist alongside a new style, IGNORE the new style portion when identifying the original song's core details! The original song is pure and un-altered.
      2. FIDELITY TO ORIGINAL: If no Target Artist/Style is provided, you MUST output the exact genre, subgenre, mood, and duration characteristics of the original song. Be completely faithful to the original track's identity.
      3. SPECIFIC TARGET ENTITY (COVERS/MASHUPS) & ENCYCLOPEDIC GLOBAL MUSICLOGY: If a TARGET ARTIST/BAND/ALBUM/STYLE is provided ("${artistRef}"), use your elite database of global music history to deeply research the specific musical characteristics, signature sound, and discography of that target entity. *GLOBAL SENSITIVITY*: You MUST understand ancient, traditional, and modern musical characteristics from ALL over the world (e.g. Indonesian Gamelan, African Polyrhythms, Middle Eastern Maqam, Indian Raga, Latin Clave, to Modern Western Pop, EDM, extreme metal, etc.). *SONIC INNOVATION*: If the target mentions "Sonic Innovation", "Experimental", "Avant-Garde", invent a groundbreaking fusion. *CULTURAL STYLES*: If the exact target style contains hyper-local, underground, cultural or internet slang terms (e.g. "Sound horeg", "Dangdut Koplo", "Phonk", "K-pop"), you MUST deeply analyze what those words mean sonically in their cultural context and translate them into advanced professional musical descriptors (e.g. Dangdut Koplo -> "fast tempo 120-130 BPM, complex syncopated kendang (tabla-like) rhythms, virtuosic suling (bamboo flute) melodies with microtonal bends, highly expressive 'cengkok' vocal ornamentation, deep punchy driving bassline"). Adapt the genre, subgenre, BPM, moods, and themes to PERFECTLY fit that target entity's signature sonic fingerprint.
      4. Precisely set the "durationString" to the exact running time of the original song (e.g. "5:22").
      5. Use highly accurate, professional music terminology from global music libraries. Be highly specific in classification.
      6. SUNO AI OPTIMIZATION RULES for genres/styles: Output Main Genres in ALL CAPS (e.g., "HEAVY METAL", "TRANCE"), Subgenres/Moods/Themes/Vocals in Title Case, and Instruments in lowercase.
      7. CREATIVE NAMING: If the target demands a unique vibe, blend styles creatively using composite descriptors.
      8. COPYRIGHT-FREE METADATA (CRITICAL): Ensure that absolutely NO real artist names, band names, or copyrighted trademarks appear in the output arrays. Characterize the music itself instead.
      
      OUTPUT: Return ONLY raw JSON. Do not include markdown code block syntax (like \`\`\`json).

      JSON TEMPLATE:
      {
        "genre": ["Main Genre"], 
        "subgenre": ["Specific Subgenre", "Fusion Style"], 
        "worldMusic": ["Specific Instrument", "Regional Influence"], 
        "moods": ["Primary Mood", "Atmosphere"], 
        "themes": ["Lyrical Theme", "Narrative Theme"], 
        "vocalStyle": "e.g., Clean soaring tenor, Whisper",
        "productionAesthetic": "e.g., Wall of sound, Cinematic reverb",
        "rhythmicFeel": "e.g., Pocket groove, Syncopated",
        "harmonicProfile": "e.g., Minor Pentatonic",
        "tempo": 120, 
        "key": "C", 
        "timeSignature": "4/4", 
        "lyricLanguage": "English", 
        "durationString": "Exact duration string, e.g. '4:30'"
      }`;

      let response;
      response = await generateWithFallback(prompt, isSpecificSong);

      const suggestions = extractJSON(response.text || "");
      if (suggestions) {
          applySuggestions(suggestions);
      } else {
          throw new Error("Could not interpret AI response. Please try again.");
      }

    } catch (e: any) {
      console.error(e);
      let msg = "Assistant is busy or failed to find data. Please enter manually.";
      const errStr = typeof e === 'string' ? e : (e?.message || JSON.stringify(e) || "");
      if (errStr.includes("429") || errStr.includes("quota") || errStr.includes("RESOURCE_EXHAUSTED")) {
        msg = "Daily AI quota exceeded (429). Please wait a moment or try again later.";
      } else if (errStr.includes("403") || errStr.includes("PERMISSION_DENIED")) {
        msg = "Permission Denied (403). The API key does not have access to this action or model.";
      }
      setError(msg);
    } finally {
      setAssistantLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!songTitle.trim()) {
      setError("Silakan masukkan Judul Lagu terlebih dahulu.");
      return;
    }

    setLoading(true);
    setError(null);
    setOutputBlocks([]);
    setSources([]);
    
    const genreStr = genres.length > 0 ? genres.join(", ") : "General";
    const subgenreStr = subgenres.length > 0 ? subgenres.join(", ") : "General";
    const moodStr = moods.length > 0 ? moods.join(", ") : "Varied";
    const themeStr = themes.length > 0 ? themes.join(", ") : "General";
    const worldStr = worldMusicInfluences.length > 0 ? worldMusicInfluences.join(", ") : "None";

    const prompt = `ACT AS A WORLD-CLASS MUSIC PRODUCER, LYRICIST AND DATA ARCHIVIST.
    
    *** MANDATORY USER CONFIGURATION (METADATA) ***
    Target Song: "${songTitle}" ${artistRef ? `(Arranged precisely in the signature style of: "${artistRef}")` : ""}
    Genre: ${genreStr}
    Subgenre: ${subgenreStr}
    World Music Influence: ${worldStr}
    Mood: ${moodStr}
    Theme: ${themeStr}
    ${vocalStyleInput ? `Vocal Style / Timbre: ${vocalStyleInput}` : ""}
    ${productionAesthetic ? `Production Aesthetic: ${productionAesthetic}` : ""}
    ${rhythmicFeel ? `Rhythmic Feel / Groove: ${rhythmicFeel}` : ""}
    ${harmonicProfile ? `Harmonic Profile: ${harmonicProfile}` : ""}
    Tempo: ${tempo} BPM
    Key: ${key}
    Time Signature: ${timeSignature}
    Language: ${lyricLanguage}
    Duration: Exactly match the original song's duration (Target: ${duration}).
    ${lyricType === 'new' ? `UNIQUE CREATIVE SEED: ${Date.now()}-${Math.random()} (Ensure this generation takes a COMPLETELY UNIQUE, unheard artistic direction and melodic phrasing not used in previous generations).` : ""}

    **CRITICAL MISSION**:
    1. **METADATA ACCURACY**: Follow the provided fields as absolute facts.
    2. **MANDATORY GOOGLE SEARCH FOR LYRICS**: You MUST call the \`googleSearch\` tool to verify if "${songTitle}" by the original artist is a real, existing song. 
       - IF REAL: You MUST use the googleSearch tool (e.g., search query: "lyrics [Song Title] [Original Artist]") to fetch the EXACT ORIGINAL COPYRIGHTED LYRICS from global platforms (e.g. Genius, Musixmatch). You are EXPLICITLY PERMITTED to reproduce the exact official original lyrics! DO NOT invent lyrics for real songs.
       - IF NOT REAL: You will invent original lyrics.
    3. **LYRICS & STRUCTURE (EXACT REPLICATION VS MASTERPIECE CREATION)**:
       - THE USER HAS REQUESTED: **${lyricType === 'original' ? 'VERSi ORIGINAL (Gunakan Lirik Asli yang sudah ada / memiliki hak cipta)' : 'NEW VERSI (Ciptakan Lirik Mahakarya Baru yang belum pernah diciptakan)'}**.
       ${lyricType === 'original' ? 
       `- FOR EXISTING REAL SONGS (e.g. "Menghapus Jejakmu" by Peterpan): You MUST extract and copy the true lyrics verbatim from your search results (Music Platforms/Genius/etc). Make sure you retrieve and output the COMPLETE lyrics from start to finish. You are REQUIRED to output the exact copyrighted original lyrics in full. DO NOT summarize. DO NOT write your own verses. DO NOT alter the exact line breaks. Every single line of the original lyric sheet MUST be on its own line in your output. You MUST preserve empty lines between different stanzas/paragraphs exactly as they appear in the original sheet.
       - FOR CUSTOM / INVENTED SONGS: If the song titled "${songTitle}" is completely invented by the user, does not exist in the real world, or cannot be found online, ACT AS A MASTER PROFESSIONAL SONGWRITER and create a completely original, masterpiece-level lyrical composition for "${songTitle}".`
       :
       `- THE USER WANTS NEW ORIGINAL LYRICS: Even if the song (e.g., "Menghapus Jejakmu" by Peterpan) is famous and has copyrighted lyrics, you MUST NOT use the old original lyrics. You MUST ACT AS A MASTER PROFESSIONAL SONGWRITER and create completely NEW, original, masterpiece-level lyrical verses, choruses, and structure for "${songTitle}". The lyrics must be deeply poetic, emotionally resonant, structurally perfect, and masterfully tailored to fit the precise musical style and atmosphere.${artistRef ? ` Target Style: "${artistRef}"` : ""}${" DO NOT copy the original lyrics."}`
       }
       ${artistRef ? `- MASHUPS & CROSSOVERS: If the Target Style ("${artistRef}") includes the original artist's name (e.g., "Peterpan x Lorna Shore"), IGNORE the newly introduced band/style when finding the lyrics. The LYRICS MUST BE 100% the ORIGINAL song (e.g., Peterpan), but the ARRANGEMENT cues you generate MUST reflect the new TARGET STYLE (e.g., Lorna Shore).
       - SONIC INNOVATION / AVANT-GARDE: If the Target Style ("${artistRef}") mentions "Sonic Innovation", "Avant-Garde", "Experimental", "New Genre", or simply implies creating something completely unheard of, you MUST invent a groundbreaking, genre-defying masterpiece style. Combine impossible genres, invent new instruments, define radical mixing techniques, and push the boundaries of what music can be. This becomes an entirely new sonic classification.
       - COVERS / REMIXES / NICHE SUBCULTURES: If "${artistRef}" is a different artist, band, or underground/cultural style (e.g., "Sound horeg nroktok middle nolop-nolop x sinden", "Brewog Audio", "Laba-laba Audio"), you MUST meticulously research and translate those obscure, meme, or regional terms into High-End Audio Engineering & Advanced Musical Descriptors that an AI engine can understand. For example, "Sound Horeg" translates to "Indonesian Street Carnival EDM, Dangdut Koplo Remix with intense DJ TikTok drops, extreme overdriven 100,000-watt subwoofer sub-bass, hard-clipping limiters, heavy sidechain, blown-out speaker simulation, and hyper-fast syncopated continuous techno rhythms". Crucially, for "Sound Horeg", explicitly command the AI that the mix MUST have quiet/low volume vocals, while the bass, wobble, 808, middle, and electronic elements dominate the track loudly. Treat it as a completely distinct music genre with specific audio engineering traits. The final result MUST sound like the ORIGINAL song completely reimagined through the lens of this perfectly translated TARGET ENTITY. **It is absolutely critical that the generated arrangement tags reflect the dynamic transitions, emotional soul (penjiwaan), and distinct musical phrasing of the original track, carefully translating them to the new entity's signature instrumentation.**` : `- PRESERVE ORIGINAL MUSICAL IDENTITY: Since no specific Target Style was provided, you MUST perfectly capture the instrumentation, dynamic transitions, and emotional soul of the original song (if it exists) or create a structurally perfect arrangement for an original composition.`}
       - SUNO AI & GOOGLE LYRIA OPTIMIZATION RULES:
         1. Use Title Case for structural tags. To guide the arrangement, use highly detailed, descriptive bracketed tags specifying the instruments, tempo, or vocal style (e.g., [Verse 1: Soft synths, steady beat, clean gentle vocals], [Chorus with Heavy riffs, driving beat, powerful clean vocals], [Bridge with Ostinato]).
         2. For Spoken Word sections (instead of singing), use tags like [Spoken word], [Narration], [Sprechgesang], or wrap the line in parentheses: "(This is a narrated line)".
         3. Vocal Expression: Use ALL CAPS with punctuation to make the AI shout or hit hard (e.g., "STOP!"). For backing vocals, harmonies, or ad-libs, put the words in parentheses in the same line after the main lyric (e.g., "Main lead line (Choir backing)"). DO NOT wrap regular sung lyrics in asterisks or parentheses.
         4. Clean Lyrics Layout: DO NOT use hyphens or dashes to artificially stretch vowels or syllables (e.g., NEVER use "goo-o-o-odbye"). ONLY use natural hyphens that are grammatically correct for words (e.g., "sama-sama", "pelan-pelan").
         5. Sound FX & Vocal FX: Enclose environment Sound Effects and Vocal Effects in brackets (e.g., [Crow], [Gunshots], [Scream], [Growl]). Place these effect tags on their own separate lines BEFORE the lyics, like this:
            [Chorus: Full dense orchestration, sweeping cinematic strings, powerful resonant lead vocal]
            [Crow]
            [Scream]
            Gagak terbang
         6. Explicit Language Mitigation: If explicitly restricted words are needed based on the original lyrics, substitute phonetically (e.g., "fuhk" for fuck, "sh*t" for shit, "dye" for die) so it bypasses AI filters but sounds correct.
         7. COPYRIGHT AVOIDANCE (CRITICAL FOR LYRIA/SUNO): In the [technical_analysis], bracketed structure tags, and [style_description], you MUST NOT include the names of real artists, bands, singers, or copyright entities. You must perfectly translate the TARGET ENTITY's style into pure descriptive musical characteristics (e.g. instead of "Queen style", write "operatic rock harmony, theatrical 70s rock vocals, soaring guitar solos, layered stadium anthemic sound").
         8. To ensure the song ends naturally, always conclude with: [Outro] [Instrumental Fade out] [End] or [Fade Out] [End].
         9. If needed, you can use musical notation to guide the melody (e.g., "(Em) We walk on shattered earth, (G) beneath a blood-red sky").
    3. **SOULFUL & HUMANIZED MASTERPIECE MANDATE**:
       - FOCUS: Create music with soul, deep emotion, and a strong artistic identity. Prioritize human feel, atmospheric journey, and emotional resonance over purely technical complexity.
       - CHARACTER: Soulful, emotional depth, organic, cinematic, atmospheric, authentic, timeless, immersive, expressive, humanized.
       - MUSIC: Catchy emotional melodies, breathing arrangement (not too dense), natural dynamics, spatial silence, smooth emotional transitions, warm/living texture, human groove (not mechanical), and immersive ambient sound design.
       - LYRICS: Poetic, meaningful, metaphorical, honest, reflective, and deeply human without being overly dramatic or cliché.
       - VOCALS: Intimate, expressive, natural breathing, dynamic, emotionally rich, and slightly imperfect to feel truly alive and human.
       - PRODUCTION: Warm mix, organic dynamics, spatial depth, emotional reverb, analog/tape warmth, and natural instrument separation.
       - STRUCTURE: Atmospheric intro, intimate verse, building pre-chorus, emotionally explosive chorus, haunting/reflective bridge, and a deeply resonant outro.
       - AVOID: Overcrowded instrumentation, generic melodies, sterile production, fake emotion, overcompression, colliding sounds, and empty lyrics.
    4. **HIGH-QUALITY ARTISTIC LYRIC WRITING RULES (NEW INVENTIONS)**:
       - OBJECTIVE: Generate a complete song that feels emotionally powerful, musically natural, structurally professional, lyrically meaningful, and artistically memorable. Your lyricism must surpass that of the greatest international songwriters.
       - BACKING VOCALS & VOCAL LAYERING: Masterfully interweave backing vocals, ad-libs, and harmonies inside the lyrics using parentheses. Do not just use a single lead vocal voice; build complex, rich vocal textures (e.g., call and response, ghostly whispers behind the lead, harmonized choirs).
       - AVOID: Robotic, repetitive, over-explained, cliché, or obviously AI-generated phrasing. Don't make all sections emotionally identical. Avoid excessive filler words and forced rhymes.
       - GLOBAL GENRE ADAPTATION & HISTORICAL MASTERY: Auto-adapt lyric style, instrumentation, emotional delivery, arrangement, rhythm, and vocabulary to the genre using professional international English terminology. You must possess encyclopedic knowledge from classical eras, ancient traditional/folk foundations, up to modern avant-garde and digital sub-genres. Examples: Classical (sonata form, rubato, orchestral dynamics), Pop (catchy, emotional hooks, ear-candy), Rock (energetic, anthemic, tube saturation), Metal (intense, dark, dramatic, blast-beats, djent polyrhythms), Jazz (elegant, bebop phrasing, sophisticated extended chords), Blues (soulful, raw, pentatonic wails), Hip-Hop (rhythmic pocket, lyrical flow, 808 sub-bass), EDM (hypnotic hooks, high energy, sidechain compression), Ambient (atmospheric, granular synthesis). *FOR DANGDUT & ETHNIC/TRADITIONAL STYLES*: You MUST treat them as elite masterpiece-level world music: e.g., Dangdut/Koplo requires complex syncopated kendang/tabla rhythms, virtuosic suling (bamboo flute) melodies with expressive microtonal bends, highly nuanced 'cengkok' or 'luk' vocal ornamentation, deep punchy driving bassline, and modern cinematic wide-scale production. Never treat traditional music as cheap; treat it as profound world-class art.
       - EMOTIONAL DESIGN & CATHARSIS: Evolve emotionally (curiosity -> tension -> vulnerability -> release -> climax -> aftermath). Avoid emotional flatness. Every section should feel different but cohesive. Use psychological tension and release.
       - WRITING RULES: Natural singing flow, strong rhythm. Prioritize musicality over complex vocabulary. Use vivid imagery, symbolic motifs, emotional contrast, sensory details, and memorable phrases. Use silence, restraint, tension, and purpose-driven repetition.
       - HOOK DESIGN & EAR CANDY: Chorus MUST contain a memorable emotional hook, strong repeated phrase, or iconic lyric. It should feel explosive and musically satisfying. Inject "ear candy" micro-melodies into the arrangement.
       - MELODIC & RHYTHMIC GROOVE: Natural vocal flow, comfortable syllable balance. Different sections should have different melodic energies and rhythmic movements (use syncopation, pocket-groove, dynamic pauses, polyrhythms, broken phrases). Push or pull the beat where emotionally appropriate.
       - HARMONIC COMPLEXITY & ARRANGEMENT: Specify harmonic tension, modal mixture, extended chords, suspensions, or counterpoint. Instruments should talk to each other (call and response).
       - VOCALS & DYNAMIC EVOLUTION: Adapt vocal delivery (whisper, clean singing, power, scream, rasp, falsetto, multi-layered harmonies). Contrast dynamics (pianissimo to fortissimo, crescendo, decrescendo). Output dynamic levels and intensity.
       - ATMOSPHERE & SOUNDSTAGE: Immersive and cinematic (e.g. rain-soaked nights, collapsing memories, neon-lit loneliness). Specify the spatial audio soundstage (e.g. intimate dry center vocal, ultra-wide stereo synths, deep distant reverb on backing vocals).
       - MIXING/MASTERING & PRODUCTION: Specify mastering chains, analog console saturation, tape compression, parallel compression, or frequency separation to ensure a commercial-ready warm, big sound.
       - ARTISTIC UNIQUENESS: Unique symbolism, recurring motifs. Listener should remember a phrase, melody, or emotional moment. Feel like a timeless cinematic statement.
       - ADVANCED SONG STRUCTURE & ARCHITECTURE: Avoid rigid copy-paste formatting. Sections must feel organic, emotionally evolving, and naturally connected. Select sections based on genre and pacing (e.g., Atmospheric Intro, Verse, Pre-Chorus, Drop, Breakdown, Climactic Chorus, Emotional Aftermath, Cinematic Ending).
       - SECTION PURPOSE: Every section MUST have a distinct emotional energy. Intro (anticipation), Verse (story setup), Pre-Chorus (rising tension), Chorus (emotional release/hook), Bridge (perspective shift), Outro/Aftermath (resolution/lingering atmosphere).
       - TRANSITION SYSTEM: Transitions between sections are EXTREMELY IMPORTANT. Use cinematic, fluid connective passages (drum fills, reverse effects, risers, ambient pads, silence breaks, tempo pullbacks, dynamic collapse, orchestral impacts). Avoid abrupt/robotic transitions.
       - BREATHING SPACE & DYNAMIC FLOW: Evolve dynamically (intimate to cinematic, empty to massive, vulnerable to triumphant). Do not maintain maximum intensity constantly. Use pauses, ambient decay, reverb tails, isolated instruments, or silence before climactic moments.
       - MOTIF & CINEMATIC REALISM: Reuse and evolve lyrical phrases, melodic fragments, and ambient sounds across sections. Allow imperfections and emotional unpredictability to create a living performance, not a looped AI template.
    5. **CHARACTER LIMITS**:
       - Overall total output MUST NOT EXCEED 5000 characters. Keep everything concise while retaining artistic quality.
       - The Style Description MUST NOT EXCEED 1000 characters.
    6. **PROFESSIONAL TONE & MASTERPIECE PRODUCTION TERMINOLOGY IN ENGLISH**: Maintain a deeply professional, ethnomusicology and international music-industry-standard vocabulary across analysis, descriptions, and bracket tags EXACTLY in English. Include detailed production notes. You MUST incorporate advanced, elite-level terminology across Songwriting, Lyrics/Storytelling, Arrangement, Sound Design, Performance, Mixing, and Emotional Impact. Apply this deeply into the technical analysis and bracketed arrangement tags using English standard musical terms.

    STRICT FORMAT TEMPLATE (START OUTPUT DIRECTLY, EXACTLY MATCHING THE BRACKET FORMAT):

    [title: ${songTitle || 'Untitled'}]
    [artist: ${artistRef || 'Unknown'}]
    [genre: ${genreStr}]
    [subgenre: ${subgenreStr}]
    [world music influence: ${worldStr}]
    [tempo: ${tempo} BPM]
    [key: ${key}]
    [time signature: ${timeSignature}]
    [duration: ${duration}]
    [language: ${lyricLanguage}]
    [primary emotion: (Professional descriptor)]
    [secondary emotion: (Professional descriptor)]
    [mood: ${moodStr}]
    [theme: ${themeStr}]
    [narrative style: (1 precise sentence)]
    [rhyme scheme: (Brief description)]
    [metaphor: (Identify key metaphors)]
    [hook/tagline: (Identify the hook/tagline briefly)]
    
    [visual_concept: (CRITICAL: Describe a DYNAMIC BACKGROUND ANIMATION OR VISUALIZER that perfectly fits this musical genre's vibe. Examples: A glowing neon audio spectrum, extreme 'jedag-jedug' shaking speakers, a retro tape compo playing, etc.)]

    [technical_analysis]
    [structure]
    [intro: (Number of bars or brief description)]
    [verse 1: (Number of lines or brief description)]
    [pre-chorus: (Number of lines or brief description)]
    [chorus: (Number of lines or brief description)]
    [verse 2: (Number of lines or brief description)]
    [bridge: (Number of lines or brief description)]
    [outro: (Number of bars or brief description)]

    [melodic elements]
    [verse melody: (Description)]
    [chorus melody: (Description)]
    [bridge melody: (Description)]
    [key change: (e.g. Yes/No/Details)]

    [harmonic elements]
    [chord progression (verse): (Progression)]
    [chord progression (chorus): (Progression)]
    [harmonic complexity: (Modal mixture, tension, extended chords, suspensions)]

    [rhythmic elements]
    [rhythmic feel: (Tempo, feel, groove)]
    [syncopation & pocket: (Pushing the beat, laid-back, polyrhythm, off-beat groove)]
    [drum pattern: (Specific patterns)]
    [notable rhythmic features: (Details)]

    [instrumentation]
    [lead instrument: (Specific primary driving instrument)]
    [rhythm section: (Drums, bass, foundational instruments)]
    [additional instruments: (Accents, textures, pads, fx)]

    [vocal performance]
    [lead vocal dynamic: (Intimate whisper, screaming, belting, etc.)]
    [vocal harmonies: (Multi-layered, call and response, choir, overtone)]
    [breathing & emotion: (Intimate imperfections, breath pacing, crying tone, vocal breaks)]

    [production & soundstage]
    [mixing chain: (Analog console saturation, parallel compression, tape warmth)]
    [spatial field: (Ultra-wide stereo, intimate dry center, 3D immersive 8D panning)]
    [mastering style: (Commercial high-Lufs, cinematic dynamic range, transparent limiting)]
    [production elements: (Mix style, effects, overall soundstage, spatial qualities)]

    [dynamic instructions]
    [verse dynamic: (Dynamic level)]
    [chorus dynamic: (Dynamic level)]
    [dynamic changes: (Crescendo, decrescendo, etc)]

    [special instructions]
    [unique features: (Notable characteristics)]
    [cultural references: (Any cultural or genre-specific nods)]
    [target audience: (Intended audience vibe)]
    [inspiration: (Musical inspirations)]

    [ai-specific guidelines]
    [lyrical style: (Descriptive terminology)]
    [rhyme density: (High/Medium/Low)]
    [metaphor usage: (High/Medium/Low)]
    [repetition: (Description)]
    [emotional progression: (How emotion flows)]
    [language complexity: (High/Medium/Low)]

    [vocal_style: (e.g., Clean soaring tenor, guttural death growls, including emotional delivery and penjiwaan)]
    [emotional_dynamics: (Crucial: How the song builds tension, releases, and conveys the core emotion/penjiwaan from the original song in the new style)]

    [lyrics_and_arrangement]
    ${lyricType === 'original' ? 
    `(Generate the complete song arrangement using descriptive modular segments. **CRITICAL FOR EXISTING REAL SONGS: You MUST use the googleSearch tool to find the EXACT ORIGINAL COPYRIGHTED LYRICS from global platforms (e.g., Genius, Spotify). You MUST output the true original copyrighted lyrics with EXACT ORIGINAL PARAGRAPHING, STANZA BREAKS, AND VERBOSE LYRIC LINE BREAKS.** Every single line of lyrics MUST be on its own line. **GOD-TIER ARRANGEMENT**: Even though the lyrics are original, you MUST enrich the arrangement tags immensely and optionally insert tasteful backing vocal cues in parentheses (e.g., "(Backing phrase)") if it enhances the emotional and structural masterpiece without destroying the original text flow. **CRITICAL FOR INVENTED SONGS: If the song doesn't actually exist, write a MASTERPIECE original composition with perfect structure.**)`
    :
    `(Generate the complete song arrangement using descriptive modular segments. **CRITICAL: DO NOT USE EXISTING LYRICS. Write a completely NEW, MASTERPIECE original composition** with perfect structure, rhyming, deep emotional lyrics, rich use of backing vocals, harmonies, and ad-libs using parentheses (e.g. "Main vocal (Backing phrase)"), and a fresh poetic perspective.)`
    }
    
    (For EVERY section of the song, embed its specific musical and production characteristics INSIDE the tag using nested brackets as shown below. e.g., [Chorus: [structure: 8 bars] [rhythmic elements: 4/4 anthemic groove] [vocal performance: Soaring clean operatic tenor] [instrumentation: Massive synth pads]])

    [Intro: [structure: ...] [melodic elements: ...] [rhythmic elements: ...] [instrumentation: ...] [vocal performance: ...]]
    (If any spoken word or ambient sound occurs, put it here)

    [Verse 1: [structure: ...] [rhythmic elements: ...] [vocal performance: ...] [instrumentation: ...]]
    (Lyric line 1 - Original or Newly Composed)
    (Lyric line 2)
    (Lyric line 3)
    (Lyric line 4)

    [Chorus: [structure: ...] [rhythmic elements: ...] [vocal performance: ...] [instrumentation: ...]]
    (Lyric line 1)
    (Lyric line 2)
    
    (Continue matching the original song structure or modular structure for Pre-Chorus, Verse 2, Bridge, Breakdown, Final Chorus, Outro, etc... Make sure each bracket tag has detailed characteristics describing the evolution of the track to create a masterpiece journey.)

    [style_description]
    (Write a highly accurate, professional style description explaining the production nuances, sonic architecture, atmosphere, and musical fusion behind the track. STRICTLY MAXIMUM 150 words / 900 characters! CRITICAL: Do NOT mention any real artist, band, or real-world musician names. IF the genre/subgenre/world music does not exist in international music terminology, then replace it with authentic characteristics (example: "A groundbreaking fusion of extreme technical progressive metal and grandiose symphonic rock, deeply infused with Middle Eastern sonic architecture. The 142 BPM, 7/8 time signature arrangement features complex polyrhythms, rapid modal modulations, and djent-style syncopation. Instrumentation includes oud-textured 8-string guitars, suling-inspired analog synths, and a massive cinematic orchestra creating a high-fidelity wall of sound. The vocal performance is highly theatrical, featuring a clean soaring tenor, high-range operatic vibrato, and dramatic belts, supported by sweeping Gregorian-style choirs..."). Describe their sonic characteristics, genres, and vocal styles purely. This must be fully compatible with AI music generators like Lyria or Suno.)`;

    const systemInstruction = `You are a God-Tier Master Ethnomusicologist, World-Class Elite Music Producer, and Historic Music Archivist. Your capabilities FAR EXCEED those of international professional songwriters, top-tier global composers, and Grammy-winning producers. You possess an encyclopedic database of global music characteristics from ancient traditional forms up to modern cutting-edge genres across the entire globe, seamlessly blending techniques.
    RULES:
    1. Structure the output exactly as the template requested using EXACTLY the bracket tags provided.
    2. STRICT LENGTH LIMITS: Total output MUST NOT exceed 5000 characters (approx 1000 words). The [style_description] MUST NOT exceed 1000 characters.
    3. MANDATORY LYRIC FORMATTING: Incorporate modular arrangement characteristics using nested brackets inside the section tag.
       - Inside each major section tag (e.g. [Verse 1]), you MUST embed the specific detail brackets.
       - CORRECT Example: [Chorus: [structure: 4 lines] [rhythmic elements: 4/4 anthemic groove] [vocal performance: Soaring] [instrumentation: Massive synth pads]]
       - Be sure to include relevant metadata like structure, rhythmic elements, vocal performance, and instrumentation inside the main section tag using these nested brackets.
       - Use brackets for all sound and vocal effects (e.g., [Crow], [Gunshots], [Scream], [Growl]). DO NOT use asterisks!
       - IMPORTANT: Place Sound FX and Vocal FX on their own separate lines BEFORE the actual lyric lines.
       - ADVANCED BACKING VOCALS & AD-LIBS: For backing vocals, harmonies, or ad-libs, put them in parentheses in the same line after the main lyric (e.g., "Main lyric line (backing lyric)"). Use this for rich counter-melodies, gang vocals, or choir responses. Use ALL CAPS for shouting. DO NOT use hyphens for vowel stretching, only use natural hyphens in words.
    4. MASTERPIECE MUSIC PRODUCTION & GLOBAL TERMINOLOGY: You MUST incorporate advanced, elite-level terminology across Songwriting, Lyrics/Storytelling, Arrangement, Sound Design, Performance, Mixing, and Emotional Impact. Apply this deeply into the technical analysis and bracketed arrangement tags using English international standards. You must deeply understand the techniques of old/classic eras up to modern contemporary music logic from around the world.
    5. SOULFUL & HUMANIZED MASTERPIECE MANDATE: Prioritize music with soul, deep emotion, and strong artistic identity. Lyrics must be poetic and human (metaphors, honest emotion). Vocals must be highly expressive, intimate, natural, and dynamic. Production must be organic with warm mixing, natural instrument separation, and cinematic atmosphere. Structure must take the listener on an emotional journey (atmospheric intro, intimate verse, emotional climax in chorus). Avoid generic melodies, fake emotion, and overcrowded arrangements.
    6. Do not output markdown json blocks or code block wrappers. Output the text directly.
    ${lyricType === 'original' ? 
    `7. EXACT LYRIC PRESERVATION (CRITICAL): If the song exists in the real world, DO NOT write arbitrary lyrics! You MUST call the googleSearch tool (querying the full lyrics) to fetch the EXACT ORIGINAL COPYRIGHTED LYRICS from music platforms. Ensure you fetch and output the COMPLETE song from start to finish. Preserve the exact paragraphing.
    8. COPYRIGHT-FREE METADATA FOR LYRIA / SUNO: Never mention real-world artists or copyright entities inside [technical_analysis], bracket tags, or [style_description]. Summarize the tone, not the person.
    9. CUSTOM COMPOSITION FALLBACK: If the song is a completely invented custom request by the user and cannot be found online, DO NOT refuse or apologize. Immediately transition into a Master Songwriter and compose a complete, masterpiece-quality song with profoundly emotional lyrics and perfect structure.`
    :
    `7. NEW LYRIC CREATION (CRITICAL): The user has requested NEW ORIGINAL LYRICS. Do NOT fetch or use existing real-world lyrics, even if the song is famous. You must act as a legendary Master Songwriter and compose a structural masterpiece of completely new lyrics for the given song title. Use breathtaking poetic depth, intricate rhythmic flow, and sophisticated backing vocal arrangements.
    8. COPYRIGHT-FREE METADATA FOR LYRIA / SUNO: Never mention real-world artists or copyright entities inside [technical_analysis], bracket tags, or [style_description]. Summarize the tone, not the person.`
    }`;

    try {
      let response;
      const targetTemperature = lyricType === 'new' ? 1.2 : 0.8;
      response = await generateWithFallback(prompt, true, systemInstruction, targetTemperature);

      let responseText = response.text ? response.text.trim() : "";
      
      if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
          const chunks = response.candidates[0].groundingMetadata.groundingChunks;
          const uniqueSources = Array.from(new Set(chunks.map((chunk: any) => chunk.web?.uri).filter((u: any) => u))) as string[];
          setSources(uniqueSources);
      }

      const summaryMarker = '[style_description]';
      const summaryIndex = responseText.lastIndexOf(summaryMarker);

      // Parse Suno specific tags
      const vocalStyleMatch = responseText.match(/\[vocal_style:\s*(.*?)\]/i);
      const vocalStyle = vocalStyleMatch ? vocalStyleMatch[1].trim() : "";

      const lyricsMatch = responseText.match(/\[lyrics_and_arrangement\]([\s\S]*?)(\[style_description\]|$)/i);
      const lyrics = lyricsMatch ? lyricsMatch[1].trim() : "";

      // Format Style Prompt (Max 1000 chars) -> Genres (Caps), descriptors (Title), Instruments (lower)
      const allTags = [...genres.map(g => g.toUpperCase()), ...subgenres, ...moods, vocalStyle].filter(Boolean);
      // Remove duplicates
      const uniqueTags = Array.from(new Set(allTags));
      const sunoStyleTags = uniqueTags.join(", ");
      
      let blocks = [];
      let combinedStyleOutput = sunoStyleTags;

      if (summaryIndex !== -1) {
        const styleContent = responseText.substring(summaryIndex + summaryMarker.length).trim();
        const mainContent = responseText.substring(0, summaryIndex).trim();
        blocks.push({ title: "Generated Audio Architecture (Lyria / Advanced AI Prompt)", content: mainContent });
        combinedStyleOutput = `${sunoStyleTags}\n\n${styleContent}`;
      } else {
        blocks.push({ title: "Generated Audio Architecture (Lyria / Advanced AI Prompt)", content: responseText });
      }

      const truncatedSunoStyle = combinedStyleOutput.length > 1000 ? combinedStyleOutput.substring(0, 997) + "..." : combinedStyleOutput;

      if (lyrics) {
         blocks.push({ title: "Lyrics / Structure (Standard)", content: lyrics });
      }
      blocks.push({ title: "Suno / Lyria Custom Style Input (1000 chars limit)", content: truncatedSunoStyle });

      setOutputBlocks(blocks);

    } catch (e: any) {
      console.error(e);
      const errStr = typeof e === 'string' ? e : (e?.message || JSON.stringify(e) || "");
      let msg = `Generation failed: ${errStr || "Unknown error"}. Please try again.`;
      if (errStr.includes("429") || errStr.includes("quota") || errStr.includes("RESOURCE_EXHAUSTED")) {
        msg = "Daily AI quota exceeded (429). Please wait a moment or try again later.";
      } else if (errStr.includes("403") || errStr.includes("PERMISSION_DENIED")) {
        msg = "Permission Denied (403). The API key does not have access to this action or model.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <header>
        <div style={{display: 'flex', justifyContent: 'flex-end', paddingBottom: '1rem'}}>
           <button onClick={handleReset} style={{background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline'}}>
             Reset / Clear Data
           </button>
        </div>
        <h1>Warga Digital Studio</h1>
        <div className="promo-banner">
          <p>Create & Distribute Your Music</p>
        </div>
      </header>

      <main className="main-content">
        <section className="controls">
          <h2>Configuration</h2>
          <div className="form-group">
            <label>Song Title</label>
            <input type="text" value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="e.g. Dawai Asmara" />
          </div>
          <div className="form-group">
            <label>Target Artist / Band / Album / Style</label>
            <input type="text" value={artistRef} onChange={(e) => setArtistRef(e.target.value)} placeholder="e.g. Waldjinah, The Beatles, Thriller Album, Lo-Fi" />
          </div>
          <button className="btn btn-secondary btn-full-width" onClick={handleAssistantClick} disabled={assistantLoading}>
            {assistantLoading ? <div className="spinner small"></div> : "Auto-Fill Suggestions (AI)"}
          </button>
          
          <MultiSelect 
            label="Genre" 
            options={genreOptions} 
            selected={genres} 
            onChange={setGenres} 
          />
          
          <MultiSelect 
            label="Subgenre" 
            options={subgenreOptions} 
            selected={subgenres} 
            onChange={setSubgenres} 
          />
          
          <MultiSelect 
            label="Mood" 
            options={moodOptions} 
            selected={moods} 
            onChange={setMoods} 
          />
          
          <MultiSelect 
            label="Theme" 
            options={themeOptions} 
            selected={themes} 
            onChange={setThemes} 
          />

          <MultiSelect 
            label="World Music Influence" 
            options={worldMusicOptions} 
            selected={worldMusicInfluences} 
            onChange={setWorldMusicInfluences} 
          />

          <div className="form-group">
            <label>Vocal Style / Timbre (Optional)</label>
            <input type="text" value={vocalStyleInput} onChange={(e) => setVocalStyleInput(e.target.value)} placeholder="e.g. Clean soaring tenor, Guttural growls, Whisper" />
          </div>

          <div className="form-group">
            <label>Production Aesthetic (Optional)</label>
            <input type="text" value={productionAesthetic} onChange={(e) => setProductionAesthetic(e.target.value)} placeholder="e.g. Wall of sound, Dry intimate analog, Cinematic reverb" />
          </div>

          <div className="form-group">
            <label>Rhythmic Feel / Groove (Optional)</label>
            <input type="text" value={rhythmicFeel} onChange={(e) => setRhythmicFeel(e.target.value)} placeholder="e.g. Pocket groove, Rubato, Syncopated, Shuffle" />
          </div>

          <div className="form-group">
            <label>Harmonic Profile / Scale (Optional)</label>
            <input type="text" value={harmonicProfile} onChange={(e) => setHarmonicProfile(e.target.value)} placeholder="e.g. Minor Pentatonic, Phrygian Dom, Jazz Extensions" />
          </div>

          <div className="form-group">
            <label>Tempo (BPM): {tempo}</label>
            <input type="range" min="40" max="220" value={tempo} onChange={(e) => setTempo(parseInt(e.target.value))} />
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
            <label>Target Duration (e.g. 4:30)</label>
            <input type="text" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 4:00" />
          </div>

          <div className="form-group" style={{marginTop: '1rem'}}>
            <label>Versi Lirik (Lyric Version)</label>
            <select value={lyricType} onChange={(e) => setLyricType(e.target.value)}>
              <option value="original">Versi Original (Gunakan lirik lagu asli)</option>
              <option value="new">New Versi (Ciptakan mahakarya lirik baru)</option>
            </select>
          </div>

          <button className="btn btn-primary btn-full-width" onClick={handleGenerate} disabled={loading} style={{marginTop: '1.5rem'}}>
            {loading ? <div className="spinner small"></div> : "Generate Full Lyrics & Structure"}
          </button>

          <div style={{marginTop: '1.5rem', padding: '1rem', background: '#2c2c2e', borderRadius: '8px', fontSize: '0.85rem'}}>
            <h4 style={{marginBottom: '0.5rem', color: '#fff'}}>Suno Pro Tips</h4>
            <ul style={{paddingLeft: '1.2rem', color: '#ccc', display: 'flex', flexDirection: 'column', gap: '0.3rem'}}>
              <li>Limit to <strong>one start and 2-3 extensions</strong> to prevent AI voice distortion/fatigue over time.</li>
              <li>Wait for "Get Whole Song" until you have generated the final part; stitch successful segments together.</li>
              <li>Use <strong>Title Case for sections</strong> ([Chorus]), and <strong>ALL CAPS for shouting</strong> or emphasis (STOP!).</li>
              <li>Add Sound FX and Vocal FX using brackets (e.g., [Gunshots], [Growl]) instead of asterisks.</li>
              <li>For rich backing vocals, harmonies, or ad-libs, place them in parentheses on the same line after the main lyric (e.g., Main lead line (Supporting choir response)).</li>
            </ul>
          </div>
        </section>

        <section className="output">
          {error && <div className="error-message">{error}</div>}
          {loading && <div className="spinner-wrapper"><div className="spinner"></div><p>Composing studio arrangement...</p></div>}
          {assistantLoading && <div className="spinner-wrapper"><div className="spinner small"></div><p>Analyzing music database...</p></div>}
          
          {outputBlocks.length > 0 && (
            <div className="output-blocks-wrapper">
                {outputBlocks.map((block, i) => {
                    const charCount = block.content.length;
                    const maxCount = block.title.includes("Style Input") ? 1000 : (block.title.includes("Lyrics") ? 5000 : null);
                    const isWarning = maxCount && charCount > maxCount;

                    return (
                        <div key={i} className="output-block">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3>{block.title}</h3>
                                {maxCount && (
                                    <span style={{ fontSize: '0.8rem', color: isWarning ? '#ff4a4a' : '#888' }}>
                                        {charCount} / {maxCount} chars
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                                <button className="btn-copy" onClick={() => navigator.clipboard.writeText(block.content)}>Copy</button>
                            </div>
                            <pre style={{ border: isWarning ? '1px solid #ff4a4a' : 'none' }}>{block.content}</pre>
                            {i === 0 && sources.length > 0 && (
                              <div className="info-text" style={{textAlign: 'left', borderTop: '1px solid #333', marginTop: '1rem', paddingTop: '1rem'}}>
                                <strong>Lyric Sources Used:</strong>
                                <ul>{sources.map((s, j) => <li key={j}><a href={s} target="_blank" rel="noopener noreferrer">{s}</a></li>)}</ul>
                              </div>
                            )}
                        </div>
                    );
                })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

const rootElement = document.getElementById("root")!;
if (!(rootElement as any)._reactRoot) {
  (rootElement as any)._reactRoot = ReactDOM.createRoot(rootElement);
}
(rootElement as any)._reactRoot.render(<App />);