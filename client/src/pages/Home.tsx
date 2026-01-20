import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { ResultsView } from "@/components/ResultsView";
import { useProcessLecture } from "@/hooks/use-lecture";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { structuredNoteItemSchema, qaPairItemSchema } from "@shared/schema";
import { z } from "zod";

type ProcessResult = {
  transcription: string;
  summary: string;
  structuredNotes: z.infer<typeof structuredNoteItemSchema>[];
  qaPairs: z.infer<typeof qaPairItemSchema>[];
};

export default function Home() {
  const [result, setResult] = useState<ProcessResult | null>(null);
  const { mutate: processLecture, isPending } = useProcessLecture();
  const { toast } = useToast();

  const handleFileSelect = (file: File) => {
    processLecture(file, {
      onSuccess: (data) => {
        setResult(data);
        toast({
          title: "Success!",
          description: "Your lecture has been processed successfully.",
        });
      },
      onError: (error) => {
        toast({
          title: "Error processing audio",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  const reset = () => {
    setResult(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="border-b border-border/40 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold font-display tracking-tight">LectureAI</h1>
          </div>
          {result && (
            <Button variant="ghost" size="sm" onClick={reset} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Upload Another
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
        {!result ? (
          <div className="max-w-3xl mx-auto text-center space-y-12">
            <div className="space-y-4">
              <h2 className="text-4xl md:text-5xl font-bold font-display tracking-tight text-foreground">
                Turn your lectures into <br />
                <span className="text-primary">perfect study notes</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                Upload your class recording and get an instant summary, structured notes, and exam practice questions powered by AI.
              </p>
            </div>

            <div className="bg-gradient-to-b from-white to-slate-50 rounded-3xl p-2">
              <FileUpload onFileSelect={handleFileSelect} isProcessing={isPending} />
            </div>

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-12 text-left">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-4">
                  <span className="font-bold">1</span>
                </div>
                <h3 className="font-bold text-lg">Upload Audio</h3>
                <p className="text-sm text-muted-foreground">Support for MP3 and WAV files directly from your recorder.</p>
              </div>
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 mb-4">
                  <span className="font-bold">2</span>
                </div>
                <h3 className="font-bold text-lg">AI Processing</h3>
                <p className="text-sm text-muted-foreground">Advanced speech-to-text and analysis to extract key concepts.</p>
              </div>
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 mb-4">
                  <span className="font-bold">3</span>
                </div>
                <h3 className="font-bold text-lg">Study Smart</h3>
                <p className="text-sm text-muted-foreground">Get summaries, bullet points, and practice questions instantly.</p>
              </div>
            </div>
          </div>
        ) : (
          <ResultsView data={result} />
        )}
      </main>
    </div>
  );
}
