// const { exec } = require("child_process");
// const ffmpeg = require("fluent-ffmpeg");
// const fs = require("fs-extra");
// const path = require("path");
// const { emitProgressToUser } = require("./socketManager");

// let ffmpegPath;
// try {
//   ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
//   const ffprobePath = require("@ffprobe-installer/ffprobe").path;
//   ffmpeg.setFfmpegPath(ffmpegPath);
//   ffmpeg.setFfprobePath(ffprobePath);
// } catch (e) {
//   console.log(
//     "ffmpeg/ffprobe not found. Make sure they are installed and in your PATH."
//   );
// }

// // 🔹 Base rendition templates (will be dynamically filtered and adjusted)
// const baseRenditions = [
//   { name: "2160p", width: 3840, height: 2160, bitrate: 15000000, minSourceBitrate: 8000000 },
//   { name: "1440p", width: 2560, height: 1440, bitrate: 9000000, minSourceBitrate: 5000000 },
//   { name: "1080p", width: 1920, height: 1080, bitrate: 5000000, minSourceBitrate: 2500000 },
//   { name: "720p", width: 1280, height: 720, bitrate: 3000000, minSourceBitrate: 1500000 },
//   { name: "480p", width: 854, height: 480, bitrate: 1500000, minSourceBitrate: 800000 },
//   { name: "360p", width: 640, height: 360, bitrate: 800000, minSourceBitrate: 400000 },
// ];

// const detectHardwareEncoder = async () => {
//   return new Promise((resolve) => {
//     exec(`"${ffmpegPath}" -hide_banner -encoders`, (err, stdout) => {
//       if (err) return resolve(null);

//       let detectedEncoder = null;
//       if (stdout.includes("h264_nvenc")) {
//         detectedEncoder = "h264_nvenc";
//       } else if (stdout.includes("h264_qsv")) {
//         detectedEncoder = "h264_qsv";
//       } else if (stdout.includes("h264_amf")) {
//         detectedEncoder = "h264_amf";
//       }

//       if (detectedEncoder === "h264_nvenc") {
//         exec(
//           `"${ffmpegPath}" -f lavfi -i color=c=red:s=1x1 -t 1 -c:v h264_nvenc -f null -`,
//           (testErr, testStdout, testStderr) => {
//             if (
//               testErr ||
//               (testStderr && testStderr.includes("Cannot load nvcuda.dll"))
//             ) {
//               console.warn(
//                 "NVENC detected but failed to initialize (nvcuda.dll missing or similar issue). Falling back to CPU."
//               );
//               return resolve(null);
//             } else {
//               return resolve("h264_nvenc");
//             }
//           }
//         );
//       } else {
//         return resolve(detectedEncoder);
//       }
//     });
//   });
// };

// // 🔹 Get detailed video information including bitrate
// const getVideoInfo = (filePath) => {
//   return new Promise((resolve, reject) => {
//     ffmpeg.ffprobe(filePath, (err, metadata) => {
//       if (err) return reject(err);

//       const videoStream = metadata.streams.find(s => s.codec_type === "video" && s.codec_name !== "png");
//       const duration = metadata.format.duration;

//       if (videoStream) {
//         const pixelFormat = videoStream.pix_fmt || "yuv420p";
//         const is10Bit = pixelFormat.includes("10le") || pixelFormat.includes("10be") || pixelFormat.includes("p010");
//         const bitDepth = is10Bit ? 10 : 8;

//         // Get bitrate from stream or calculate from format
//         let bitrate = parseInt(videoStream.bit_rate) || parseInt(metadata.format.bit_rate) || 0;

//         // If no bitrate found, estimate from file size and duration
//         if (!bitrate && metadata.format.size && duration) {
//           bitrate = Math.floor((metadata.format.size * 8) / duration);
//         }

//         resolve({
//           width: videoStream.width || 1920,
//           height: videoStream.height || 1080,
//           duration: duration || 0,
//           pixelFormat,
//           bitDepth,
//           is10Bit,
//           bitrate: bitrate,
//           frameRate: eval(videoStream.r_frame_rate) || 25
//         });
//       } else {
//         resolve({
//           width: 1920,
//           height: 1080,
//           duration: 0,
//           pixelFormat: "yuv420p",
//           bitDepth: 8,
//           is10Bit: false,
//           bitrate: 2000000,
//           frameRate: 25
//         });
//       }
//     });
//   });
// };

// // 🔹 Generate dynamic renditions based on source video
// const generateDynamicRenditions = (videoInfo) => {
//   const { width, height, bitrate, frameRate } = videoInfo;

//   console.log(`📊 Source video: ${width}x${height}, ${Math.round(bitrate / 1000)}kbps, ${frameRate}fps`);

//   // Filter renditions that are smaller or equal to source resolution
//   let availableRenditions = baseRenditions.filter(r =>
//     r.width <= width && r.height <= height
//   );

//   // If no suitable renditions found, create one based on source
//   if (availableRenditions.length === 0) {
//     availableRenditions = [{
//       name: "source",
//       width: width,
//       height: height,
//       bitrate: Math.max(bitrate * 0.8, 500000), // Use 80% of source bitrate, min 500kbps
//       minSourceBitrate: 0
//     }];
//   }

//   // Adjust bitrates based on source video bitrate and quality
//   const dynamicRenditions = availableRenditions.map(rendition => {
//     let adjustedBitrate = rendition.bitrate;

//     // If source bitrate is available, adjust target bitrates intelligently
//     if (bitrate > 0) {
//       const bitrateRatio = Math.min(bitrate / rendition.minSourceBitrate, 2); // Max 2x boost

//       // For high-quality sources, increase bitrate slightly
//       if (bitrate > rendition.minSourceBitrate * 1.5) {
//         adjustedBitrate = Math.floor(rendition.bitrate * Math.min(bitrateRatio * 0.3 + 0.7, 1.3));
//       }
//       // For low-quality sources, reduce bitrate to avoid upscaling artifacts
//       else if (bitrate < rendition.minSourceBitrate) {
//         adjustedBitrate = Math.floor(Math.min(rendition.bitrate, bitrate * 0.9));
//       }
//     }

//     // Adjust for high frame rate content (>30fps)
//     if (frameRate > 30) {
//       adjustedBitrate = Math.floor(adjustedBitrate * 1.2); // Increase bitrate by 20% for high fps
//     }

//     // Ensure minimum bitrate
//     adjustedBitrate = Math.max(adjustedBitrate, 200000); // Min 200kbps

//     return {
//       ...rendition,
//       bitrate: adjustedBitrate,
//       originalBitrate: rendition.bitrate // Keep original for reference
//     };
//   });

//   // Always include at least one rendition, prefer 720p or closest
//   if (dynamicRenditions.length === 0) {
//     const fallbackRendition = baseRenditions.find(r => r.name === "720p") || baseRenditions[0];
//     dynamicRenditions.push({
//       ...fallbackRendition,
//       width: Math.min(fallbackRendition.width, width),
//       height: Math.min(fallbackRendition.height, height)
//     });
//   }

//   // Sort by quality (highest first)
//   dynamicRenditions.sort((a, b) => b.width - a.width);

//   // Limit to maximum 3 renditions to reduce file count
//   const finalRenditions = dynamicRenditions.slice(0, 3);

//   console.log(`🎯 Generated ${finalRenditions.length} renditions:`,
//     finalRenditions.map(r => `${r.name} (${Math.round(r.bitrate / 1000)}kbps)`).join(', '));

//   return finalRenditions;
// };

// // 🔹 Helper: Get appropriate H.264 profile and settings
// const getEncodingSettings = (bitDepth, hwEncoder) => {
//   if (hwEncoder) {
//     return {
//       profile: "",
//       pixfmt: bitDepth === 10 ? "p010le" : "yuv420p",
//       additionalParams: bitDepth === 10 ? "-profile:v main10" : "-profile:v main"
//     };
//   } else {
//     if (bitDepth === 10) {
//       return {
//         profile: "high10",
//         pixfmt: "yuv420p",
//         additionalParams: "-profile:v high10"
//       };
//     } else {
//       return {
//         profile: "main",
//         pixfmt: "yuv420p",
//         additionalParams: "-profile:v main"
//       };
//     }
//   }
// };

// // 🔹 Calculate optimal segment duration based on video length
// const calculateSegmentDuration = (videoDuration) => {
//   if (videoDuration <= 600) return 60;      // ≤10min: 60s segments
//   if (videoDuration <= 1800) return 90;     // ≤30min: 90s segments
//   if (videoDuration <= 3600) return 120;    // ≤1hour: 120s segments
//   return 180;                               // >1hour: 180s segments (3min)
// };

// function updateProgress(
//   userId,
//   movieTitle,
//   start,
//   end,
//   step,
//   totalSteps,
//   message,
//   process = "Converting"
// ) {
//   const progress = start + (step / totalSteps) * (end - start);
//   emitProgressToUser(userId, {
//     status: "processing",
//     message,
//     progress: Math.min(99, Math.round(progress)),
//     movieTitle,
//     process,
//   });
// }

// const getSubtitleStreamsInfo = (filePath) => {
//   return new Promise((resolve, reject) => {
//     ffmpeg.ffprobe(filePath, (err, metadata) => {
//       if (err) return reject(err);
//       const subtitleStreams = metadata.streams
//         .filter((s) => s.codec_type === "subtitle")
//         .map((s) => ({
//           index: s.index,
//           codec: s.codec_name,
//           tags: s.tags || {},
//         }));
//       resolve(subtitleStreams);
//     });
//   });
// };

// const extractSubtitles = async (inputPath, outputDir, subtitleStreams) => {
//   let subtitleInfo = [];
//   for (let i = 0; i < subtitleStreams.length; i++) {
//     const stream = subtitleStreams[i];
//     const lang = stream.tags?.language || "und";
//     const name = stream.tags?.title || `Subtitle ${i + 1}`;
//     const outputVtt = path.join(outputDir, `subtitle${i}.vtt`);

//     await execPromise(
//       `"${ffmpegPath}" -i "${inputPath}" -map 0:s:${i} "${outputVtt}"`
//     );

//     subtitleInfo.push({
//       index: i,
//       lang,
//       name,
//       file: `subtitle${i}.vtt`,
//     });
//   }
//   return subtitleInfo;
// };

// const getAudioStreamsInfo = (filePath) => {
//   return new Promise((resolve, reject) => {
//     ffmpeg.ffprobe(filePath, (err, metadata) => {
//       if (err) return reject(err);
//       const audioStreams = metadata.streams
//         .filter((s) => s.codec_type === "audio")
//         .map((s) => ({
//           index: s.index,
//           codec: s.codec_name,
//           tags: s.tags || {},
//           disposition: s.disposition || {},
//         }));
//       resolve(audioStreams);
//     });
//   });
// };

// const convertToHLS = async (
//   inputPath,
//   outputDir,
//   movieTitle,
//   userId,
//   customSegmentDuration = null
// ) => {
//   return new Promise(async (resolve, reject) => {
//     try {
//       const hwEncoder = await detectHardwareEncoder();
//       const videoCodec = hwEncoder || "libx264";
//       const preset = hwEncoder ? "fast" : "superfast";

//       console.log(`🎬 Using encoder: ${videoCodec} (${preset})`);

//       emitProgressToUser(userId, {
//         status: "starting",
//         message: "Starting video conversion...",
//         progress: 1,
//         movieTitle,
//         process: "Converting",
//       });

//       fs.ensureDirSync(outputDir);

//       // 🔹 Get detailed video information including bit depth
//       updateProgress(userId, movieTitle, 1, 5, 1, 1, "Analyzing video properties...");
//       const videoInfo = await getVideoInfo(inputPath);
//       console.log(`📹 Video Info:`, videoInfo);

//       // 🔹 Calculate optimal segment duration to reduce .ts files
//       const segmentDuration = customSegmentDuration || calculateSegmentDuration(videoInfo.duration);
//       console.log(`⏱️ Using ${segmentDuration}s segments (estimated ${Math.ceil(videoInfo.duration / segmentDuration)} files per rendition)`);

//       // 🔹 Get encoding settings based on bit depth
//       const encodingSettings = getEncodingSettings(videoInfo.bitDepth, hwEncoder);
//       console.log(`⚙️ Encoding Settings:`, encodingSettings);

//       updateProgress(userId, movieTitle, 1, 5, 1, 1, "Analyzing audio streams...");
//       const audioStreams = await getAudioStreamsInfo(inputPath);
//       if (audioStreams.length === 0) {
//         return reject(new Error("No audio streams found in the video."));
//       }

//       updateProgress(userId, movieTitle, 5, 10, 1, 1, "Analyzing subtitle streams...");
//       const subtitleStreams = await getSubtitleStreamsInfo(inputPath);

//       let subtitleInfo = [];
//       if (subtitleStreams.length > 0) {
//         updateProgress(userId, movieTitle, 10, 15, 1, 1, "Extracting subtitles...");
//         subtitleInfo = await extractSubtitles(inputPath, outputDir, subtitleStreams);
//       }

//       const { width, height, duration, bitDepth, bitrate, frameRate } = videoInfo;

//       // 🔹 Generate dynamic renditions based on source video
//       const dynamicRenditions = generateDynamicRenditions(videoInfo);
//       console.log(`📋 Using ${dynamicRenditions.length} dynamic renditions for processing`);

//       // 🔹 Convert video renditions with proper bit depth handling
//       let videoVariants = [];
//       for (let i = 0; i < dynamicRenditions.length; i++) {
//         const r = dynamicRenditions[i];
//         const variantName = `video_${movieTitle}_${r.name}.m3u8`;
//         const segmentPattern = path.join(outputDir, `video_${movieTitle}_${r.name}_%03d.ts`);
//         const outputPlaylist = path.join(outputDir, variantName);

//         updateProgress(
//           userId,
//           movieTitle,
//           20,
//           80,
//           i,
//           dynamicRenditions.length,
//           `Converting video to ${r.name} (${i + 1}/${dynamicRenditions.length})... [${bitDepth}-bit ${videoCodec}, ${segmentDuration}s segments]`
//         );

//         // 🔹 Build FFmpeg command with proper 10-bit handling
//         let ffmpegCmd;

//         if (hwEncoder) {
//           // Hardware encoder command
//           ffmpegCmd = `"${ffmpegPath}" -i "${inputPath}" \
//             -vf "scale=w=${r.width}:h=${r.height}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2" \
//             -c:v ${videoCodec} -b:v ${r.bitrate} -preset ${preset} ${encodingSettings.additionalParams} -crf 20 \
//             -sc_threshold 0 -g ${segmentDuration * 2} -keyint_min ${segmentDuration * 2} \
//             -hls_time ${segmentDuration} -hls_list_size 0 \
//             -hls_segment_filename "${segmentPattern}" -f hls "${outputPlaylist}"`;
//         } else {
//           // Software encoder command with pixel format conversion for 10-bit content
//           const pixelFormatFilter = bitDepth === 10
//             ? `scale=w=${r.width}:h=${r.height}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p`
//             : `scale=w=${r.width}:h=${r.height}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`;

//           ffmpegCmd = `"${ffmpegPath}" -i "${inputPath}" \
//             -vf "${pixelFormatFilter}" \
//             -c:v ${videoCodec} -b:v ${r.bitrate} -preset ${preset} ${encodingSettings.additionalParams} -crf 20 \
//             -sc_threshold 0 -g ${segmentDuration * 2} -keyint_min ${segmentDuration * 2} \
//             -hls_time ${segmentDuration} -hls_list_size 0 \
//             -hls_segment_filename "${segmentPattern}" -f hls "${outputPlaylist}"`;
//         }

//         await execPromise(ffmpegCmd);

//         videoVariants.push({
//           name: r.name,
//           playlist: variantName,
//           bandwidth: r.bitrate,
//           resolution: `${r.width}x${r.height}`,
//         });
//       }

//       // 🔹 Convert audio renditions with larger segments
//       let audioInfo = [];
//       for (let i = 0; i < audioStreams.length; i++) {
//         const stream = audioStreams[i];
//         const audioOutput = path.join(outputDir, `audio_${movieTitle}_${i}.m3u8`);

//         updateProgress(
//           userId,
//           movieTitle,
//           80,
//           95,
//           i,
//           audioStreams.length,
//           `Converting audio stream ${i + 1}/${audioStreams.length}... [${segmentDuration}s segments]`
//         );

//         await execPromise(
//           `"${ffmpegPath}" -i "${inputPath}" -map 0:a:${i} -c:a aac -b:a 128k \
//           -f hls -hls_time ${segmentDuration} -hls_list_size 0 \
//           -hls_segment_filename "${path.join(
//             outputDir,
//             `audio_${movieTitle}_${i}_%03d.ts`
//           )}" \
//           -max_muxing_queue_size 9999 "${audioOutput}"`
//         );

//         audioInfo.push({
//           index: i,
//           lang: stream.tags?.language || "und",
//           name: stream.tags?.title || `Language ${i + 1}`,
//         });
//       }

//       // 🔹 Master playlist
//       updateProgress(userId, movieTitle, 95, 99, 1, 1, "Creating master playlist...");
//       let masterPlaylistContent = `#EXTM3U\n#EXT-X-VERSION:3\n`;

//       for (const v of videoVariants) {
//         masterPlaylistContent += `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth},RESOLUTION=${v.resolution},CODECS="avc1.64001f,mp4a.40.2",AUDIO="audio"\n${v.playlist}\n`;
//       }

//       audioStreams.forEach((stream, i) => {
//         const lang = stream.tags?.language || "und";
//         const name = stream.tags?.title || `Language ${i + 1}`;
//         const isDefault = i === 0 ? "YES" : "NO";
//         masterPlaylistContent += `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="${name}",LANGUAGE="${lang}",DEFAULT=${isDefault},AUTOSELECT=YES,URI="audio_${movieTitle}_${i}.m3u8"\n`;
//       });

//       subtitleInfo.forEach((sub) => {
//         masterPlaylistContent += `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="${sub.name}",LANGUAGE="${sub.lang}",DEFAULT=NO,AUTOSELECT=YES,URI="${sub.file}"\n`;
//       });

//       fs.writeFileSync(
//         path.join(outputDir, `${movieTitle}.master.m3u8`),
//         masterPlaylistContent
//       );

//       // 🔹 Calculate and log file count reduction
//       const estimatedTotalSegments = Math.ceil(duration / segmentDuration) * (dynamicRenditions.length + audioStreams.length);
//       console.log(`📁 Estimated total .ts files: ${estimatedTotalSegments} (${segmentDuration}s segments)`);

//       emitProgressToUser(userId, {
//         status: "completed",
//         message: `Video conversion completed! Generated ${estimatedTotalSegments} segment files.`,
//         progress: 100,
//         movieTitle,
//         process: "Converting",
//       });

//       resolve({ audioInfo, duration, segmentCount: estimatedTotalSegments });
//     } catch (err) {
//       emitProgressToUser(userId, {
//         status: "error",
//         message: `Conversion failed: ${err.message}`,
//         progress: 0,
//         movieTitle,
//         process: "Converting",
//       });
//       reject(err);
//     }
//   });
// };

// const execPromise = (cmd) => {
//   return new Promise((resolve, reject) => {
//     exec(cmd, (error, stdout, stderr) => {
//       if (error) {
//         console.error(stderr);
//         reject(error);
//       } else {
//         resolve(stdout);
//       }
//     });
//   });
// };

// module.exports = {
//   convertToHLS,
// };

// convertToHLS.js
const { spawn } = require("child_process");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const ffprobeInstaller = require("@ffprobe-installer/ffprobe");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs-extra");
const path = require("path");
const { emitProgressToUser } = require("./socketManager"); // adapt path if needed

// set paths for fluent-ffmpeg
const FFMPEG_PATH = ffmpegInstaller.path;
const FFPROBE_PATH = ffprobeInstaller.path;
ffmpeg.setFfmpegPath(FFMPEG_PATH);
ffmpeg.setFfprobePath(FFPROBE_PATH);

// ---------- Utility helpers ----------
const sanitize = (name) => {
  if (!name) return "";
  return name.replace(/[:<>\"/\\|?*\n\r\t]+/g, "_");
};

const ensureDirForFile = (filePath) => {
  const dir = path.dirname(filePath);
  fs.ensureDirSync(dir);
};

const spawnFfmpeg = (args) => {
  return spawn(FFMPEG_PATH, args, { windowsHide: true });
};

// ---------- Probe helpers ----------
const ffprobeInfo = (filePath) =>
  new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata);
    });
  });

const getAudioStreamsInfo = async (filePath) => {
  const meta = await ffprobeInfo(filePath);
  return meta.streams
    .filter((s) => s.codec_type === "audio")
    .map((s) => ({
      index: s.index,
      codec: s.codec_name,
      tags: s.tags || {},
      disposition: s.disposition || {},
    }));
};

const getSubtitleStreamsInfo = async (filePath) => {
  const meta = await ffprobeInfo(filePath);
  return meta.streams
    .filter((s) => s.codec_type === "subtitle")
    .map((s) => ({ index: s.index, codec: s.codec_name, tags: s.tags || {} }));
};

const getVideoInfo = async (filePath) => {
  const meta = await ffprobeInfo(filePath);
  const video = meta.streams.find((s) => s.codec_type === "video") || {};
  const duration = meta.format?.duration || 0;
  const fpsRaw = video.r_frame_rate || video.avg_frame_rate || "25/1";
  const fps = (() => {
    try {
      const parts = fpsRaw.split("/");
      return Number(parts[0]) / Number(parts[1]);
    } catch (e) {
      return 25;
    }
  })();
  return {
    width: video.width || 1920,
    height: video.height || 1080,
    duration,
    fps,
  };
};

// ---------- Detect hardware encoder ----------
const detectHardwareEncoder = async () =>
  new Promise((resolve) => {
    const p = spawn(FFMPEG_PATH, ["-hide_banner", "-encoders"]);
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("close", () => {
      if (out.includes("h264_nvenc")) return resolve("h264_nvenc");
      if (out.includes("h264_qsv")) return resolve("h264_qsv");
      if (out.includes("h264_amf")) return resolve("h264_amf");
      resolve(null);
    });
    p.on("error", () => resolve(null));
  });

// ---------- Subtitle extraction ----------
const extractSubtitleToVtt = (inputFile, outputVtt, streamIndex) =>
  new Promise((resolve, reject) => {
    ensureDirForFile(outputVtt);
    // Use ffmpeg to extract subtitle to .vtt (ffmpeg auto-converts ass->webvtt or srt->vtt)
    const args = [
      "-i",
      inputFile,
      "-map",
      `0:${streamIndex}`,
      "-f",
      "webvtt",
      outputVtt,
      "-y",
    ];
    const ff = spawnFfmpeg(args);
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("Subtitle extraction failed (code " + code + ")"));
    });
    ff.on("error", (err) => reject(err));
  });

// ---------- Run ffmpeg with progress streaming ----------
/**
 * runFfmpegWithProgress:
 *  - args: ffmpeg args array
 *  - duration: total seconds of input (used to compute progress)
 *  - onProgress(percent) callback receives 0-100 integer
 * Returns promise resolves when ffmpeg exits code 0, rejects otherwise.
 */
const runFfmpegWithProgress = (
  args,
  duration,
  onProgress,
  detectGpuFailStrings = []
) =>
  new Promise((resolve, reject) => {
    const ff = spawnFfmpeg(args);
    let lastPercent = 0;
    let stderrBuf = "";

    ff.stderr.on("data", (chunk) => {
      const s = chunk.toString();
      stderrBuf += s;

      // Look for GPU-fail strings
      for (const str of detectGpuFailStrings) {
        if (s.includes(str)) {
          // kill immediately and reject with a special error
          try {
            ff.kill("SIGKILL");
          } catch (e) {}
          const err = new Error("GPU_FAILURE_DETECTED:" + str);
          err.gpuFailString = str;
          return reject(err);
        }
      }

      // parse time=HH:MM:SS.ms
      const m = s.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m && duration && duration > 0) {
        const h = Number(m[1]),
          mm = Number(m[2]),
          ss = Number(m[3]);
        const seconds = h * 3600 + mm * 60 + ss;
        let percent = Math.floor((seconds / duration) * 100);
        if (percent > 100) percent = 100;
        if (percent > lastPercent) {
          lastPercent = percent;
          try {
            onProgress(Math.max(1, percent)); // ensure at least 1
          } catch (e) {}
        }
      }
    });

    ff.on("close", (code) => {
      if (code === 0) {
        try {
          onProgress(100);
        } catch (e) {}
        resolve({ code, stderr: stderrBuf });
      } else {
        reject(new Error("FFMPEG_EXIT_CODE_" + code + " " + stderrBuf));
      }
    });

    ff.on("error", (err) => reject(err));
  });

// ---------- Renditions (keep same as user) ----------
const renditions = [
  { name: "1080p", width: 1920, height: 1080, crf: 23 },
  { name: "720p", width: 1280, height: 720, crf: 24 },
  { name: "480p", width: 854, height: 480, crf: 26 },
  { name: "360p", width: 640, height: 360, crf: 28 },
];

// ---------- Main exported function ----------
/**
 * convertToHLS(inputPath, outBaseDir, movieTitle, userId, opts)
 * opts: { segmentDuration (sec), preferGPU (bool) }
 */
const convertToHLS = async (
  inputPath,
  outBaseDir,
  movieTitle,
  userId,
  opts = {}
) => {
  try {
    // Top-level try block
    const segmentDuration = opts.segmentDuration || 12; // seconds
    const preferGPU = opts.preferGPU !== false; // default true
    const encodingMode = opts.encodingMode || "h264"; // reserved

    const safeTitle = sanitize(movieTitle || "video");
    const outputDir = path.resolve(outBaseDir, safeTitle);
    await fs.ensureDir(outputDir);

    // Prepare master playlist path
    const masterPlaylistPath = path.join(outputDir, `${safeTitle}.master.m3u8`);

    // Emit start
    emitProgressToUser(userId, {
      status: "starting",
      message: "Starting conversion",
      progress: 1,
      movieTitle,
      process: "Converting",
    });

    // Probe input
    const videoInfo = await getVideoInfo(inputPath);
    const duration = videoInfo.duration || 0;

    // Read streams
    const audioStreams = await getAudioStreamsInfo(inputPath);
    const subtitleStreams = await getSubtitleStreamsInfo(inputPath);

    // If there are subtitle streams, extract them first (map to progress 5-15%)
    let subtitleInfo = [];
    if (subtitleStreams.length > 0) {
      emitProgressToUser(userId, {
        status: "processing",
        message: "Extracting subtitles",
        progress: 5,
        movieTitle,
        process: "Converting",
      });

      for (let i = 0; i < subtitleStreams.length; i++) {
        const s = subtitleStreams[i];
        const vttName = `${safeTitle}_sub_${i}.vtt`;
        const vttPath = path.join(outputDir, vttName);
        try {
          await extractSubtitleToVtt(inputPath, vttPath, s.index);
          subtitleInfo.push({
            index: s.index,
            lang: s.tags?.language || "und",
            name: s.tags?.title || `Subtitle ${i + 1}`,
            file: vttName,
          });
        } catch (ex) {
          // log and continue (don't fail whole job)
          console.warn("Subtitle extraction failed for", s.index, ex.message);
          emitProgressToUser(userId, {
            status: "failed",
            message: `Failed to extract subtitle ${i + 1}: ${ex.message}`,
            progress: Math.min(
              15,
              5 +
                Math.round(((i + 1) / Math.max(1, subtitleStreams.length)) * 10)
            ),
            movieTitle,
            process: "Converting",
          });
        }
        // update progress slightly per subtitle
        const p =
          5 + Math.round(((i + 1) / Math.max(1, subtitleStreams.length)) * 10); // 5->15
        emitProgressToUser(userId, {
          status: "processing",
          message: `Subtitles: ${i + 1}/${subtitleStreams.length}`,
          progress: Math.min(15, p),
          movieTitle,
          process: "Converting",
        });
      }
    } else {
      // no subtitles - set progress to 15
      emitProgressToUser(userId, {
        status: "processing",
        message: "No subtitles found",
        progress: 15,
        movieTitle,
        process: "Converting",
      });
    }

    // Decide encoder
    let hwEncoder = null;
    if (preferGPU && encodingMode === "h264") {
      try {
        hwEncoder = await detectHardwareEncoder();
      } catch (e) {
        hwEncoder = null;
      }
    }

    // Determine codec & quality param
    const codecInfo = (useHw) => {
      if (useHw === "h264_nvenc")
        return {
          codec: "h264_nvenc",
          qualityFlag: ["-cq", "20"],
          preset: ["-preset", "fast"],
        };
      if (useHw === "h264_qsv")
        return {
          codec: "h264_qsv",
          qualityFlag: ["-global_quality", "20"],
          preset: ["-preset", "fast"],
        };
      if (useHw === "h264_amf")
        return {
          codec: "h264_amf",
          qualityFlag: ["-quality", "20"],
          preset: ["-preset", "fast"],
        };
      // fallback CPU
      return {
        codec: "libx264",
        qualityFlag: ["-crf", "23"],
        preset: ["-preset", "veryfast"],
      };
    };

    let usedHw = hwEncoder; // may be null

    // Convert renditions sequentially, mapping overall progress 20 -> 80
    const renditionsToRun = renditions.filter(
      (r) => r.width <= videoInfo.width
    );
    if (renditionsToRun.length === 0) {
      // ensure at least smallest
      renditionsToRun.push(renditions[renditions.length - 1]);
    }

    const rendStart = 20,
      rendEnd = 80;
    const rendTotal = renditionsToRun.length;

    const videoVariants = [];

    for (let ri = 0; ri < renditionsToRun.length; ri++) {
      const r = renditionsToRun[ri];
      const outPlaylist = path.join(outputDir, `${safeTitle}_${r.name}.m3u8`);
      const outPattern = path.join(outputDir, `${safeTitle}_${r.name}_%03d.ts`);
      ensureDirForFile(outPlaylist);
      ensureDirForFile(outPattern);

      // prepare args array
      let chosenHw = usedHw; // attempt GPU if available
      let info = codecInfo(chosenHw);

      // Build ffmpeg args (array form)
      const argsBase = ["-i", inputPath];

      // scaling filter
      argsBase.push(
        "-vf",
        `scale=w=${r.width}:h=${r.height}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`
      );

      // video codec + quality flags + preset
      argsBase.push("-c:v", info.codec);
      argsBase.push(...info.qualityFlag);
      argsBase.push(...info.preset);

      // audio
      argsBase.push("-c:a", "aac", "-b:a", "128k");

      // GOP/keyframe
      const gop = Math.max(
        2,
        Math.round(segmentDuration * (videoInfo.fps || 25))
      );
      argsBase.push(
        "-sc_threshold",
        "0",
        "-g",
        String(gop),
        "-keyint_min",
        String(gop)
      );

      // hls config
      argsBase.push(
        "-hls_time",
        String(segmentDuration),
        "-hls_list_size",
        "0",
        "-hls_segment_filename",
        outPattern,
        "-f",
        "hls",
        outPlaylist,
        "-y"
      );

      // function to map local percent to global percent and emit
      const mapProgressToGlobal = (localPercent) => {
        // map 0..100 -> rendStart..rendEnd, combined with per-rendition offset
        const base =
          rendStart + Math.floor((ri / rendTotal) * (rendEnd - rendStart));
        const chunk = Math.floor((1 / rendTotal) * (rendEnd - rendStart));
        const global = base + Math.floor((localPercent / 100) * chunk);
        // keep increasing monotonic, ensure at least 20..80
        const clamped = Math.max(rendStart, Math.min(rendEnd, global));
        emitProgressToUser(userId, {
          status: "processing",
          message: `Converting ${r.name} (${ri + 1}/${rendTotal})`,
          progress: Math.round(clamped),
          movieTitle,
          process: "Converting",
        });
      };

      // run attempt (GPU if available) and fallback on GPU-specific failures
      let attemptCodec = info.codec;
      let attemptArgs = argsBase.slice();

      // detect GPU failure by specific strings
      const detectGpuFailStrings = [
        "Cannot load nvcuda.dll",
        "Failed to initialize NVML",
        "No such device",
        "Unknown encoder 'h264_nvenc'",
      ];

      let ranOk = false;
      let lastErr = null;

      try {
        await runFfmpegWithProgress(
          attemptArgs,
          duration,
          mapProgressToGlobal,
          detectGpuFailStrings
        );
        ranOk = true;
      } catch (err) {
        lastErr = err;
        // if GPU attempt failed and we tried hw, retry with CPU
        if (
          (usedHw && String(err.message).includes("GPU_FAILURE_DETECTED")) ||
          usedHw
        ) {
          // retry with libx264
          const cpuInfo = codecInfo(null);
          const cpuArgs = argsBase.slice();
          // replace codec/quality/preset positions (they were inserted earlier)
          // rebuild properly: remove previously inserted items and add CPU ones
          // Simpler approach: rebuild argsBaseCpu cleanly:
          const argsBaseCpu = [
            "-i",
            inputPath,
            "-vf",
            `scale=w=${r.width}:h=${r.height}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`,
            "-c:v",
            cpuInfo.codec,
            ...cpuInfo.qualityFlag,
            ...cpuInfo.preset,
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-sc_threshold",
            "0",
            "-g",
            String(gop),
            "-keyint_min",
            String(gop),
            "-hls_time",
            String(segmentDuration),
            "-hls_list_size",
            "0",
            "-hls_segment_filename",
            outPattern,
            "-f",
            "hls",
            outPlaylist,
            "-y",
          ];
          // emit fallback notice
          emitProgressToUser(userId, {
            status: "processing",
            message: `GPU failed for ${r.name}, retrying with CPU`,
            progress: Math.min(
              60,
              rendStart + Math.floor((ri / rendTotal) * (rendEnd - rendStart))
            ),
            movieTitle,
            process: "Converting",
          });
          try {
            await runFfmpegWithProgress(
              argsBaseCpu,
              duration,
              mapProgressToGlobal,
              []
            );
            ranOk = true;
            usedHw = null; // mark GPU not used
          } catch (err2) {
            lastErr = err2;
            ranOk = false;
            emitProgressToUser(userId, {
              status: "failed",
              message: `Failed to convert ${r.name} even with CPU fallback: ${err2.message}`,
              progress: Math.round(
                Math.min(
                  rendEnd,
                  rendStart +
                    Math.floor(((ri + 1) / rendTotal) * (rendEnd - rendStart))
                )
              ),
              movieTitle,
              process: "Converting",
            });
          }
        }
      }

      if (!ranOk) {
        // final failure for this rendition
        emitProgressToUser(userId, {
          status: "failed",
          message: `Failed to create rendition ${r.name}: ${
            lastErr ? lastErr.message : "Unknown error"
          }`,
          progress: Math.round(
            Math.min(
              rendEnd,
              rendStart +
                Math.floor(((ri + 1) / rendTotal) * (rendEnd - rendStart))
            )
          ),
          movieTitle,
          process: "Converting",
        });
        throw (
          lastErr ||
          new Error("Unknown ffmpeg error while creating rendition " + r.name)
        );
      }

      // push variant info (we don't compute exact bandwidth; consumer can set later)
      videoVariants.push({
        name: r.name,
        playlist: path.basename(outPlaylist),
        resolution: `${r.width}x${r.height}`,
        // bandwidth estimation is omitted to avoid misreporting; could be derived from CRF & bitrate heuristics
      });
    } // end renditions loop

    // convert audio streams individually to HLS (map global 80 -> 92)
    const audioStart = 80,
      audioEnd = 92;
    const audioTotal = Math.max(1, audioStreams.length);
    const audioInfoOut = [];

    for (let ai = 0; ai < audioStreams.length; ai++) {
      const a = audioStreams[ai];
      const outPlaylist = path.join(outputDir, `${safeTitle}_audio_${ai}.m3u8`);
      const outPattern = path.join(
        outputDir,
        `${safeTitle}_audio_${ai}_%03d.ts`
      );
      ensureDirForFile(outPlaylist);
      ensureDirForFile(outPattern);

      // args for audio-only HLS from specific audio stream
      const args = [
        "-i",
        inputPath,
        "-map",
        `0:${a.index}`,
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-vn",
        "-hls_time",
        String(segmentDuration),
        "-hls_list_size",
        "0",
        "-hls_segment_filename",
        outPattern,
        "-f",
        "hls",
        outPlaylist,
        "-y",
      ];

      // map progress function
      const mapAudioProgress = (localPercent) => {
        // audioStart..audioEnd mapped based on ai index and localPercent
        const base =
          audioStart + Math.floor((ai / audioTotal) * (audioEnd - audioStart));
        const chunk = Math.floor((1 / audioTotal) * (audioEnd - audioStart));
        const global = base + Math.floor((localPercent / 100) * chunk);
        emitProgressToUser(userId, {
          status: "processing",
          message: `Converting audio ${ai + 1}/${audioTotal}`,
          progress: Math.min(
            audioEnd,
            Math.max(audioStart, Math.round(global))
          ),
          movieTitle,
          process: "Converting",
        });
      };

      await runFfmpegWithProgress(args, duration, mapAudioProgress, []).catch(
        (e) => {
          // don't fail whole job for audio — but log and throw if you prefer strict
          console.warn(
            "Audio HLS generation failed for stream",
            a.index,
            e.message
          );
          emitProgressToUser(userId, {
            status: "failed",
            message: `Failed to convert audio stream ${ai + 1}: ${e.message}`,
            progress: Math.min(
              audioEnd,
              Math.max(
                audioStart,
                Math.round(
                  audioStart +
                    Math.floor(
                      ((ai + 1) / audioTotal) * (audioEnd - audioStart)
                    )
                )
              )
            ),
            movieTitle,
            process: "Converting",
          });
          throw e; // here we choose to fail - you may change to continue
        }
      );

      audioInfoOut.push({
        index: a.index,
        lang: a.tags?.language || "und",
        name: a.tags?.title || `audio ${ai + 1}`,
        playlist: path.basename(outPlaylist),
      });
    }

    // create master playlist (92 -> 98)
    emitProgressToUser(userId, {
      status: "processing",
      message: "Creating master playlist",
      progress: 95,
      movieTitle,
      process: "Converting",
    });

    let master = "#EXTM3U\n#EXT-X-VERSION:3\n";

    // Include AUDIO group entries first
    audioInfoOut.forEach((a, idx) => {
      const defaultFlag = idx === 0 ? "YES" : "NO";
      master += `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="${a.name}",LANGUAGE="${a.lang}",DEFAULT=${defaultFlag},AUTOSELECT=YES,URI="${a.playlist}"\n`;
    });

    // Subtitles (if any)
    subtitleInfo.forEach((s, idx) => {
      master += `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="${s.name}",LANGUAGE="${s.lang}",DEFAULT=NO,AUTOSELECT=YES,URI="${s.file}"\n`;
    });

    // Video renditions
    videoVariants.forEach((v) => {
      // If you want accurate BANDWIDTH estimates, compute them or use constants for each rendition.
      // For safety, we'll omit bandwidth estimate or use a generic placeholder.
      master += `#EXT-X-STREAM-INF:RESOLUTION=${v.resolution},CODECS="avc1.640029,mp4a.40.2",AUDIO="audio",SUBTITLES="subs"\n${v.playlist}\n`;
    });

    fs.writeFileSync(masterPlaylistPath, master, "utf8");

    // Final progress
    emitProgressToUser(userId, {
      status: "completed",
      message: "Conversion completed",
      progress: 100,
      movieTitle,
      process: "Converting",
    });

    return {
      duration,
    };
  } catch (err) {
    console.error("Critical error during HLS conversion:", err);
    emitProgressToUser(userId, {
      status: "failed",
      message: `Critical conversion error: ${err.message}`,
      progress: 0, // Reset or set to a specific error progress
      movieTitle,
      process: "Converting",
    });
    throw err; // Re-throw to propagate the error if needed further up
  }
};

module.exports = { convertToHLS };
