import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileAudio, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isProcessing: boolean;
}

export function FileUpload({ onFileSelect, isProcessing }: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a']
    },
    maxFiles: 1,
    disabled: isProcessing
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

  return (
    <div className="w-full max-w-2xl mx-auto">
      <AnimatePresence mode="wait">
        {!selectedFile ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            {...getRootProps()}
            className={cn(
              "relative overflow-hidden rounded-3xl border-2 border-dashed transition-all duration-300 cursor-pointer group",
              isDragActive 
                ? "border-primary bg-primary/5 scale-[1.02]" 
                : "border-border hover:border-primary/50 hover:bg-muted/30",
              "h-80 flex flex-col items-center justify-center text-center p-8"
            )}
          >
            <input {...getInputProps()} />
            <div className={cn(
              "w-20 h-20 rounded-2xl flex items-center justify-center mb-6 transition-colors",
              isDragActive ? "bg-primary text-white" : "bg-secondary text-primary group-hover:bg-primary group-hover:text-white"
            )}>
              <Upload className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold mb-2 font-display text-foreground">
              {isDragActive ? "Drop audio here" : "Upload Lecture Audio"}
            </h3>
            <p className="text-muted-foreground max-w-sm">
              Drag & drop your lecture recording, or click to browse. Supports MP3, WAV.
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card rounded-3xl border border-border shadow-xl p-8"
          >
            <div className="flex items-center gap-6 mb-8">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <FileAudio className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg truncate pr-4">{selectedFile.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={clearFile}
                disabled={isProcessing}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <Button 
              onClick={handleProcess} 
              disabled={isProcessing}
              className="w-full text-lg h-14"
              size="lg"
            >
              {isProcessing ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processing Lecture...</span>
                </div>
              ) : (
                "Generate Notes & Summary"
              )}
            </Button>
            
            {isProcessing && (
              <p className="text-center text-sm text-muted-foreground mt-4 animate-pulse">
                This may take a few moments depending on the file size.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
