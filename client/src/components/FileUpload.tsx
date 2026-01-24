import { useCallback, useState, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileAudio, X, Mic, Square, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isProcessing: boolean;
}

// ============================================================
// FILE UPLOAD COMPONENT
// Supports: Drag & drop, click to browse, and in-app recording
// ============================================================

export function FileUpload({ onFileSelect, isProcessing }: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // ============================================================
  // AUDIO RECORDING STATE
  // Uses browser MediaRecorder API for in-app recording
  // ============================================================
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Drag & drop handler - accepts mp3, wav, m4a files
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.webm']
    },
    maxFiles: 1,
    disabled: isProcessing || isRecording
  });

  const handleProcess = () => {
    if (selectedFile) {
      onFileSelect(selectedFile);
    }
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
  };

  // ============================================================
  // AUDIO RECORDING FUNCTIONS
  // Start/Stop recording using MediaRecorder API
  // ============================================================
  
  /**
   * Starts audio recording from user's microphone.
   * Uses MediaRecorder API with webm/opus codec for efficiency.
   * Recording is saved as chunks and combined when stopped.
   */
  const startRecording = async () => {
    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create MediaRecorder with webm format (widely supported)
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus"
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      
      // Collect audio data chunks as they become available
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      // When recording stops, create a File from collected chunks
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], "recording.webm", { type: "audio/webm" });
        setSelectedFile(file);
        
        // Clean up: stop all audio tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      // Start recording with 100ms chunks for smooth processing
      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      
      // Timer to show recording duration
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
    } catch (err) {
      console.error("Failed to start recording:", err);
      alert("Could not access microphone. Please ensure you have granted permission.");
    }
  };

  /**
   * Stops the current recording.
   * The recorded audio is automatically converted to a File object.
   */
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Format seconds to MM:SS display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <AnimatePresence mode="wait">
        {/* ============================================================
            RECORDING STATE UI
            Shows when user is actively recording audio
            ============================================================ */}
        {isRecording ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-card rounded-3xl border border-destructive/30 shadow-xl p-8 text-center"
          >
            {/* Animated recording indicator */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-4 h-4 bg-destructive rounded-full animate-pulse" />
              <span className="text-2xl font-bold font-display text-destructive">
                Recording...
              </span>
            </div>
            
            {/* Recording timer */}
            <div className="text-4xl font-mono font-bold text-foreground mb-8">
              {formatTime(recordingTime)}
            </div>
            
            {/* Stop recording button */}
            <Button 
              onClick={stopRecording}
              variant="destructive"
              size="lg"
              className="gap-2"
              data-testid="button-stop-recording"
            >
              <Square className="w-5 h-5" />
              Stop Recording
            </Button>
          </motion.div>
        ) : !selectedFile ? (
          /* ============================================================
             UPLOAD STATE UI
             Drag & drop zone with recording option
             ============================================================ */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Drag & Drop Area */}
            <div
              {...getRootProps()}
              className={cn(
                "relative overflow-hidden rounded-3xl border-2 border-dashed transition-all duration-300 cursor-pointer group",
                isDragActive 
                  ? "border-primary bg-primary/5 scale-[1.02]" 
                  : "border-border hover:border-primary/50 hover:bg-muted/30",
                "h-64 flex flex-col items-center justify-center text-center p-8"
              )}
            >
              <input {...getInputProps()} data-testid="input-file-upload" />
              <div className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-colors",
                isDragActive ? "bg-primary text-white" : "bg-secondary text-primary group-hover:bg-primary group-hover:text-white"
              )}>
                <Upload className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2 font-display text-foreground">
                {isDragActive ? "Drop audio here" : "Upload Lecture Audio"}
              </h3>
              <p className="text-muted-foreground text-sm max-w-sm">
                Drag & drop your lecture recording, or click to browse. Supports MP3, WAV, M4A.
              </p>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-sm text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Record Audio Button */}
            <Button
              onClick={startRecording}
              variant="outline"
              size="lg"
              className="w-full h-14 gap-3 text-lg"
              disabled={isProcessing}
              data-testid="button-start-recording"
            >
              <Mic className="w-5 h-5 text-destructive" />
              Record Lecture Now
            </Button>
          </motion.div>
        ) : (
          /* ============================================================
             FILE SELECTED STATE UI
             Shows selected file info with process button
             ============================================================ */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card rounded-3xl border border-border shadow-xl p-8"
          >
            <div className="flex items-center gap-6 mb-8">
              {/* File icon */}
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <FileAudio className="w-8 h-8" />
              </div>
              
              {/* File info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg truncate pr-4" data-testid="text-filename">
                  {selectedFile.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to process
                </p>
              </div>
              
              {/* Clear button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={clearFile}
                disabled={isProcessing}
                className="text-muted-foreground hover:text-destructive"
                data-testid="button-clear-file"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Process button */}
            <Button 
              onClick={handleProcess} 
              disabled={isProcessing}
              className="w-full text-lg h-14"
              size="lg"
              data-testid="button-process"
            >
              {isProcessing ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing Lecture...</span>
                </div>
              ) : (
                "Generate Notes & Summary"
              )}
            </Button>
            
            {/* Processing hint */}
            {isProcessing && (
              <p className="text-center text-sm text-muted-foreground mt-4 animate-pulse">
                This may take a few moments depending on the lecture length.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
