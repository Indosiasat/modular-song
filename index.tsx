import { GoogleGenAI, Type } from "@google/genai";
import React, { useState, useCallback, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Professionally revised lists based on international music terminology standards
const INITIAL_GENRE_OPTIONS = [
  // Core Genres
  "Pop", "Rock", "Hip Hop", "R&B & Soul", "Jazz", "Blues", "Country", "Folk", "Reggae", "Latin", "Classical", "Funk", "Metal", "World", 
  // Major Electronic Genres
  "Electronic", "House", "Techno", "Trance", "Dubstep", "Drum and Bass", "Ambient"
];

const INITIAL_SUBGENRE_OPTIONS = [
  // Indonesian Fusion Specialties
  "Indonesian Traditional Dance Fusion", "Indonesian Electronic Dance Fusion", "Dangdut Electronic Fusion", "Indonesian Folk/Ethnic Fusion",
  
  // Pop Subgenres
  "Dance-Pop", "Indie Pop", "Hyperpop", "Pop Ballad", "Synth-pop",
  
  // Rock Subgenres
  "Alternative Rock", "Indie Rock", "Progressive Rock", "Punk Rock", "Hard Rock",
  
  // Metal Subgenres
  "Heavy Metal", "Thrash Metal", "Death Metal", "Power Metal",
  
  // Hip Hop Subgenres
  "Trap", "Lo-fi Hip Hop", "Boom Bap", "Drill",
  
  // R&B & Soul Subgenres
  "Neo-Soul", "Contemporary R&B",
  
  // Jazz Subgenres
  "Smooth Jazz", "Bebop", "Jazz Fusion",
  
  // Blues Subgenres
  "Delta Blues", "Chicago Blues", "Electric Blues",
  
  // Country Subgenres
  "Country Pop", "Bluegrass",
  
  // Folk Subgenres
  "Singer-Songwriter", "American Folk",

  // House Subgenres
  "Deep House", "Progressive House", "Tech House", "Tropical House",

  // Techno Subgenres
  "Minimal Techno", "Industrial Techno", "Acid Techno",

  // Trance Subgenres
  "Progressive Trance", "Psytrance", "Uplifting Trance",

  // Dubstep Subgenres
  "Chillstep", "Brostep", "Riddim", "Future Garage",

  // Drum and Bass Subgenres
  "Liquid Drum and Bass", "Neurofunk", "Jump-Up",

  // Other Electronic
  "Chillwave", "IDM (Intelligent Dance Music)", "Downtempo"
];

const INITIAL_WORLD_MUSIC_OPTIONS = [
    "Indonesian Gamelan", "Indonesian Kroncong", "West African Afrobeat", "Middle Eastern Oud", "Latin Salsa", "Celtic Folk", "Indian Sitar", "Japanese Koto", "Brazilian Bossa Nova"
];

const MOOD_OPTIONS = ["Energetic", "Joyful", "Melancholic", "Reflective", "Aggressive", "Calm", "Romantic"];
const THEME_OPTIONS = ["Party", "Cultural", "Storytelling", "Love", "Life", "Protest", "Nature"];
const KEY_OPTIONS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const TIME_SIGNATURE_OPTIONS = ["4/4", "3/4", "6/8", "2/4", "5/4", "7/8"];
const LYRIC_LANGUAGE_OPTIONS = ["Indonesian", "English"];

const TEMPLATE_BLOCK_1A = `
[title: ...]
[genre: {genre}]
[subgenre: {subgenre}]
[tempo: {tempo} BPM]
[key: {key} Major/Minor]
[time signature: {timeSignature}]
[duration: ~4 min]
[primary emotion: {mood}]
[secondary emotion: ...]
[mood: {mood}]
[theme: {theme}]
[narrative style: ...]
[rhyme scheme: ...]
[metaphor: ...]
[hook/tagline: ...]

[structure]
[intro: ...]
[verse 1: ...]
[pre-chorus: ...]
[chorus: ...]
[verse 2: ...]
[bridge: ...]
[solo/interlude: ...]
[drop: ...]
[outro: ...]

[melodic elements: ...]
[harmonic elements: ...]
[rhythmic elements: ...]
[instrumentation: ...]
[dynamic instructions: ...]
[special instructions: ...]
[ai-specific guidelines: ...]

[Song lyrics structure]
[segmen]
{lyricInstruction}
`;

const TEMPLATE_BLOCK_1B = `
[title: ... extended]
[genre: {genre}]
[subgenre: {subgenre}]
[tempo: {tempo} BPM]
[key: {key} Major/Minor]
[time signature: {timeSignature}]
[duration: ~8 min]
[primary emotion: {mood}]
[secondary emotion: ...]
[mood: {mood}]
[theme: {theme}]
[narrative style: ...]
[rhyme scheme: ...]
[metaphor: ...]
[hook/tagline: ...]

[structure]
[intro: ... extended]
[verse 1: ... extended]
[pre-chorus: ... extended]
[chorus: ... extended]
[verse 2: ... extended]
[bridge: ... extended]
[solo/interlude: ... extended / virtuosic]
[drop: ... extended / maximum energy]
[outro: ... extended]

[melodic elements: ... extended]
[harmonic elements: ... extended]
[rhythmic elements: ... extended]
[instrumentation: ... extended]
[dynamic instructions: ... extended]
[special instructions: ... extended]
[ai-specific guidelines: ... extended]

[Song lyrics structure]
[segmen]
{lyricInstruction}
`;

const TEMPLATE_BLOCK_2 = `
[style summary (200 chars): ...]
[style detailed (1000 chars): ...]
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
  const [backgroundTrack, setBackgroundTrack] = useState(null);
  const [backgroundTrackUrl, setBackgroundTrackUrl] = useState(null);


  // App states
  const [loading, setLoading] = useState(false);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [error, setError] = useState(null);
  const [outputBlocks, setOutputBlocks] = useState([]);
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
      let prompt = "You are an expert music analyst. Your task is to suggest a complete set of parameters for a new hit song. Provide genre, subgenre, worldMusic (as a specific influence like 'Indonesian Gamelan'), mood, theme, tempo (as a number between 40-220), key (e.g., 'C', 'G#'), and timeSignature (e.g., '4/4', '3/4').";

      if (artistRef || songTitle) {
        if (artistRef) {
          prompt += ` Base your suggestions on the musical style, characteristics, and typical themes of the artist/band: ${artistRef}.`;
        }
        if (songTitle) {
          prompt += ` Also, draw inspiration from the title: "${songTitle}".`;
        }
      } else {
        prompt += " Base your suggestions on an analysis of current global and Indonesian music trends on platforms like YouTube, Spotify, and TikTok.";
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
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
            },
          },
        },
      });

      const suggestions = JSON.parse(response.text);

      if (suggestions.genre && !genreOptions.includes(suggestions.genre)) setGenreOptions(prev => [suggestions.genre, ...prev]);
      setGenre(suggestions.genre || genre);

      if (suggestions.subgenre && !subgenreOptions.includes(suggestions.subgenre)) setSubgenreOptions(prev => [suggestions.subgenre, ...prev]);
      setSubgenre(suggestions.subgenre || subgenre);

      if (suggestions.worldMusic && !worldMusicOptions.includes(suggestions.worldMusic)) setWorldMusicOptions(prev => [suggestions.worldMusic, ...prev]);
      setWorldMusic(suggestions.worldMusic || worldMusic);
      
      if (suggestions.mood && !moodOptions.includes(suggestions.mood)) setMoodOptions(prev => [suggestions.mood, ...prev]);
      setMood(suggestions.mood || mood);

      if (suggestions.theme && !themeOptions.includes(suggestions.theme)) setThemeOptions(prev => [suggestions.theme, ...prev]);
      setTheme(suggestions.theme || theme);

      if (suggestions.tempo && typeof suggestions.tempo === 'number') setTempo(Math.round(Math.max(40, Math.min(220, suggestions.tempo))));
      
      if (suggestions.key && KEY_OPTIONS.includes(suggestions.key)) setKey(suggestions.key);
      
      if (suggestions.timeSignature && TIME_SIGNATURE_OPTIONS.includes(suggestions.timeSignature)) setTimeSignature(suggestions.timeSignature);


    } catch (e) {
      console.error(e);
      setError("The AI assistant failed to provide suggestions. Please try again.");
    } finally {
      setAssistantLoading(false);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setOutputBlocks([]);
    setGeneratedImages([]);
    setImageError(null);
    setShowVisualizer(false);

    const isFourMinutes = duration === "4";
    const selectedTemplate = isFourMinutes ? TEMPLATE_BLOCK_1A : TEMPLATE_BLOCK_1B;
    const charLimit = isFourMinutes ? 3000 : 5000;
    
    // FIX: Set a generous token limit to prevent the output from being truncated.
    const maxTokens = 8192;
    const thinkingBudget = 512;

    const lyricInstruction = `Write original lyrics in ${lyricLanguage} following the style of artist/band: ${artistRef || "N/A"}, but keep it unique. All metadata must be in English.`;

    let finalTemplate = selectedTemplate
      .replace('[title: ...]', `[title: ${songTitle || '...'}]`)
      .replace('[title: ... extended]', `[title: ${songTitle || '... extended'}]`)
      .replace('{genre}', genre)
      .replace('{subgenre}', subgenre)
      .replace('{tempo}', String(tempo))
      .replace('{key}', key)
      .replace('{timeSignature}', timeSignature)
      .replace('{mood}', mood)
      .replace('{theme}', theme)
      .replace('{lyricInstruction}', lyricInstruction);
    
    // FIX: Create a clearer, more robust prompt for the AI.
    const fullTemplate = `${finalTemplate}\n\n${TEMPLATE_BLOCK_2}`;
    const prompt = `You are a professional music producer. Your task is to complete the following music composition template. Fill in every placeholder denoted by '...'. The output must strictly follow the provided structure and be a single block of text. Ensure the total character count for the generated lyrics and music structure does not exceed ${charLimit}. Make sure to complete all sections, including the '[style summary]' and '[style detailed]' at the end.

---
${fullTemplate}
---
`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          maxOutputTokens: maxTokens,
          thinkingConfig: { thinkingBudget: thinkingBudget },
        },
      });

      const responseText = response.text.trim();
      
      // FIX: Implement robust, case-insensitive parsing to handle variations in AI output.
      const summaryMarker = '[style summary';
      const summaryIndex = responseText.toLowerCase().indexOf(summaryMarker.toLowerCase());

      if (summaryIndex > 0) {
        const templateResult = responseText.substring(0, summaryIndex).trim();
        const summaryResult = responseText.substring(summaryIndex).trim();
        setOutputBlocks([
          { title: "Generated Music Template", content: templateResult },
          { title: "Style Summary", content: summaryResult },
        ]);
      } else if (responseText) {
        // Fallback if the marker isn't found but we have a response
        setOutputBlocks([
          { title: "Generated Music Template", content: responseText },
          { title: "Style Summary", content: "[style summary (200 chars): Not generated]\n[style detailed (1000 chars): Not generated]" },
        ]);
      } else {
        setError("The AI generated an empty response. Please try again.");
      }
    } catch (e) {
      console.error(e);
      setError("Failed to generate the music template. Please try adjusting your parameters.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateImages = async () => {
    setImageLoading(true);
    setImageError(null);
    setGeneratedImages([]);

    try {
      const summaryBlock = outputBlocks.find(b => b.title === "Style Summary");
      let songDescription = `A visual representation of a song with the mood '${mood}' and theme '${theme}'.`; // Fallback
      if (summaryBlock) {
          const detailedSummaryMarker = '[style detailed (1000 chars):';
          const summaryContent = summaryBlock.content;
          const detailedIndex = summaryContent.toLowerCase().indexOf(detailedSummaryMarker.toLowerCase());
          if (detailedIndex !== -1) {
              songDescription = summaryContent.substring(detailedIndex + detailedSummaryMarker.length).replace(']', '').trim();
          }
      }

      const imagePrompt = `
        Generate 4 photorealistic images of a band named "${artistRef || 'an independent artist'}" performing their song titled "${songTitle || 'Untitled'}" live on stage.
        The band's appearance, instruments, stage lighting, and overall atmosphere must reflect the song's characteristics:
        - Genre: ${genre}
        - Mood: ${mood}
        - Artist Style Inspiration: ${artistRef || 'Modern pop/rock bands'}
        
        Detailed Visual Brief:
        ---
        ${songDescription}
        ---
        Capture dynamic, high-energy action shots of the band members performing with passion.
      `;

      const response = await ai.models.generateImages({
          model: 'imagen-4.0-generate-001',
          prompt: imagePrompt,
          config: {
            numberOfImages: 4,
            outputMimeType: 'image/jpeg',
            aspectRatio: '16:9',
          },
      });

      const imageUrls = response.generatedImages.map(img => `data:image/jpeg;base64,${img.image.imageBytes}`);
      setGeneratedImages(imageUrls);

    } catch (e) {
      console.error(e);
      setImageError(`An error occurred while generating images: ${e.message}`);
    } finally {
      setImageLoading(false);
    }
  };
  
  const handleGenerateVisualizer = () => {
    setShowVisualizer(true);
  };
  
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setBackgroundTrack(file);
      const objectUrl = URL.createObjectURL(file);
      // Clean up previous URL if it exists
      if (backgroundTrackUrl) {
        URL.revokeObjectURL(backgroundTrackUrl);
      }
      setBackgroundTrackUrl(objectUrl);
    }
  };

  const CopyButton = ({ textToCopy }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    };
    return <button onClick={handleCopy} className="btn-copy">{copied ? "Copied!" : "Copy"}</button>;
  };

  return (
    <div className="container">
      <header>
        <h1>Warga Digital Studio</h1>
        <div className="promo-banner">
          <svg className="promo-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55c-2.21 0-4 1.79-4 4s1.79 4 4 4s4-1.79 4-4V7h4V3h-6z"/>
          </svg>
          <div className="promo-text-content">
            <p>Listen to our latest tracks & follow our journey.</p>
            <a href="https://www.soundon.global/bio/indosiasat" target="_blank" rel="noopener noreferrer">
              Find us on SoundOn
            </a>
          </div>
        </div>
      </header>
      <main className="main-content">
        <div className="controls">
          <h2>Controls</h2>
          
          <div className="form-group">
            <label htmlFor="song-title">Song Title (Optional)</label>
            <input type="text" id="song-title" value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="e.g., Midnight Rhapsody"/>
          </div>

          <div className="form-group">
            <label htmlFor="artist-ref">Artist/Band Reference (Optional)</label>
            <input type="text" id="artist-ref" value={artistRef} onChange={(e) => setArtistRef(e.target.value)} placeholder="e.g., Tulus, Sheila On 7" />
          </div>
          
          <button onClick={handleAssistantClick} disabled={assistantLoading} className="btn btn-ghost btn-full-width">
            {assistantLoading ? <div className="spinner small"></div> : "Suggest with AI"}
          </button>
          
          <hr style={{margin: '1.5rem 0', border: '1px solid var(--border-color)'}} />

          <div className="form-group">
            <label htmlFor="genre">Genre</label>
            <select id="genre" value={genre} onChange={(e) => setGenre(e.target.value)}>
              {genreOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="subgenre">Subgenre</label>
            <select id="subgenre" value={subgenre} onChange={(e) => setSubgenre(e.target.value)}>
              {subgenreOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="world-music">World Music Influence</label>
            <select id="world-music" value={worldMusic} onChange={(e) => setWorldMusic(e.target.value)}>
              {worldMusicOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="mood">Mood</label>
            <select id="mood" value={mood} onChange={(e) => setMood(e.target.value)}>
              {moodOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="theme">Theme</label>
            <select id="theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
              {themeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="lyric-language">Lyric Language</label>
            <select id="lyric-language" value={lyricLanguage} onChange={(e) => setLyricLanguage(e.target.value)}>
              {LYRIC_LANGUAGE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Duration</label>
            <div className="radio-group">
              <label><input type="radio" name="duration" value="4" checked={duration === "4"} onChange={() => setDuration("4")} /> 4 min</label>
              <label><input type="radio" name="duration" value="8" checked={duration === "8"} onChange={() => setDuration("8")} /> 8 min</label>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="tempo-slider">Tempo: {tempo} BPM</label>
            <div className="tempo-control">
              <input type="range" id="tempo-slider" min="40" max="220" value={tempo} onChange={(e) => setTempo(Number(e.target.value))} />
              <input type="number" id="tempo-number" min="40" max="220" value={tempo} onChange={(e) => setTempo(Number(e.target.value))} />
            </div>
          </div>
           <div className="form-group">
            <label htmlFor="key">Key</label>
            <select id="key" value={key} onChange={(e) => setKey(e.target.value)}>
              {KEY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="time-signature">Time Signature</label>
            <select id="time-signature" value={timeSignature} onChange={(e) => setTimeSignature(e.target.value)}>
              {TIME_SIGNATURE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          
           <div className="form-group">
            <label htmlFor="background-music">Background Music (Optional)</label>
            <input type="file" id="background-music" accept="audio/*" onChange={handleFileUpload} />
             {backgroundTrack && <div className="file-name-display">{backgroundTrack.name}</div>}
          </div>

          <button onClick={handleGenerate} disabled={loading} className="btn btn-primary btn-full-width">
            {loading ? <div className="spinner small"></div> : "Generate"}
          </button>
        </div>
        <div className="output">
          {error && <div className="error-message">{error}</div>}
          {imageError && <div className="error-message">{imageError}</div>}
          
          {imageLoading && (
            <div className="spinner-wrapper">
              <div className="spinner"></div>
              <p>Generating band images...</p>
            </div>
          )}

          {generatedImages.length > 0 && (
            <div className="image-gallery-block">
              <h3>Generated Band Images</h3>
              <div className="image-gallery-grid">
                {generatedImages.map((src, index) => (
                   <div key={index} className="generated-image-container">
                    <img src={src} alt={`Generated band image ${index + 1}`} className="generated-image"/>
                   </div>
                ))}
              </div>
            </div>
          )}
          
          {showVisualizer && (
            <div className="visualizer-container">
              <MusicVisualizer tempo={tempo} mood={mood} songTitle={songTitle} artistRef={artistRef} />
            </div>
          )}

          {!loading && outputBlocks.length === 0 && !imageLoading && generatedImages.length === 0 && !showVisualizer && (
            <div className="placeholder">Your generated music template will appear here.</div>
          )}

          {loading && !imageLoading && (
            <div className="spinner-wrapper">
              <div className="spinner"></div>
              <p>Generating your masterpiece...</p>
            </div>
          )}
          
          {outputBlocks.length > 0 && (
            <>
              <div className="output-actions">
                <button onClick={handleGenerateImages} disabled={imageLoading} className="btn btn-secondary">
                   {imageLoading ? <div className="spinner small"></div> : "Generate Band Images"}
                </button>
                <button onClick={handleGenerateVisualizer} className="btn btn-secondary">
                  Generate Visualizer
                </button>
              </div>

              <div className="output-blocks-wrapper">
                {outputBlocks.map((block, index) => (
                  <div key={index} className="output-block">
                    <h3>{block.title}</h3>
                    <CopyButton textToCopy={block.content} />
                    <pre>{block.content}</pre>
                  </div>
                ))}
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);