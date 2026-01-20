import { useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useProcessLecture() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("audio", file);

      const res = await fetch(api.process.path, {
        method: api.process.method,
        body: formData,
        // No Content-Type header needed for FormData, browser sets it with boundary
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to process audio");
      }

      return api.process.responses[200].parse(await res.json());
    },
  });
}
