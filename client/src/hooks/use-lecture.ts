import { useState } from "react";
import { api } from "@shared/routes";

export function useProcessLecture() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const generateLecture = async (
    file: File,
    mode: "theory" | "numerical",
    marksList: number[]   // ✅ NEW PARAM
  ) => {
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("mode", mode);

      // ✅ Append marks as JSON string
      formData.append("marksList", JSON.stringify(marksList));

      const res = await fetch(api.process.path, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to process lecture");
      }

      const data = await res.json();
      setResult(data);
      return data;
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    generateLecture,
    loading,
    error,
    result,
  };
}
