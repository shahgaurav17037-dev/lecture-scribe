import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { ResultsView } from "@/components/ResultsView";
import { useProcessLecture } from "@/hooks/use-lecture";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  const { generateLecture, loading, result } = useProcessLecture();
  const { toast } = useToast();

  const [mode, setMode] = useState<"theory" | "numerical">("theory");

  // ✅ MARKS STATE
  const [selectedMarks, setSelectedMarks] = useState<number[]>([]);
  const [customMarks, setCustomMarks] = useState<number | "">("");

  const toggleMark = (mark: number) => {
    if (selectedMarks.includes(mark)) {
      setSelectedMarks(selectedMarks.filter((m) => m !== mark));
    } else {
      if (selectedMarks.length >= 2) {
        toast({
          title: "Limit Reached",
          description: "You can select maximum 2 mark types.",
          variant: "destructive",
        });
        return;
      }
      setSelectedMarks([...selectedMarks, mark]);
    }
  };

  const handleCustomAdd = () => {
    if (!customMarks || customMarks < 2 || customMarks > 20) {
      toast({
        title: "Invalid Marks",
        description: "Custom marks must be between 2 and 20.",
        variant: "destructive",
      });
      return;
    }
    toggleMark(Number(customMarks));
    setCustomMarks("");
  };

  const handleFileSelect = async (file: File) => {
    if (selectedMarks.length === 0) {
      toast({
        title: "Select Marks",
        description: "Please select at least one marks type.",
        variant: "destructive",
      });
      return;
    }

    try {
      await generateLecture(file, mode, selectedMarks);

      toast({
        title: "Success",
        description: "Lecture processed successfully",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Something went wrong",
        variant: "destructive",
      });
    }
  };

  const reset = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto h-16 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary text-white rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold">LectureAI</h1>
          </div>

          {result && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Upload Another
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-12">
        {!result ? (
          <div className="max-w-3xl mx-auto text-center space-y-8">

            <div>
              <p className="text-purple-400 text-sm font-medium">
                Turn your lectures into
              </p>
              <h2 className="text-4xl md:text-5xl font-bold text-purple-600">
                Perfect Notes
              </h2>
            </div>

            {/* MODE SELECTOR */}
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setMode("theory")}
                className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                  mode === "theory"
                    ? "bg-purple-600 text-white"
                    : "bg-white text-muted-foreground"
                }`}
              >
                📘 Theory Mode
              </button>

              <button
                onClick={() => setMode("numerical")}
                className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                  mode === "numerical"
                    ? "bg-purple-600 text-white"
                    : "bg-white text-muted-foreground"
                }`}
              >
                🧮 Numerical Mode
              </button>
            </div>

            {/* MARKS SELECTOR */}
            <div className="border rounded-lg p-4 text-left space-y-3">
              <p className="font-medium text-sm">
                Select Question Marks (Max 2)
              </p>

              <div className="flex gap-4 flex-wrap">
                {[2, 5, 10].map((mark) => (
                  <label key={mark} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedMarks.includes(mark)}
                      onChange={() => toggleMark(mark)}
                    />
                    {mark} Marks
                  </label>
                ))}
              </div>

              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  placeholder="Custom"
                  value={customMarks}
                  onChange={(e) =>
                    setCustomMarks(
                      e.target.value ? Number(e.target.value) : ""
                    )
                  }
                  className="border rounded px-2 py-1 w-24"
                />
                <Button type="button" onClick={handleCustomAdd}>
                  Add
                </Button>
              </div>
            </div>

            <FileUpload
              onFileSelect={handleFileSelect}
              isProcessing={loading}
            />

          </div>
        ) : (
          <ResultsView data={result} />
        )}
      </main>
    </div>
  );
}
