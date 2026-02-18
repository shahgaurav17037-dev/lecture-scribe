import { motion } from "framer-motion";
import { FileText, BookOpen, List, GraduationCap } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

/* ✅ UPDATED TYPES — marks now dynamic number */
interface ResultsViewProps {
  data: {
    transcription: string;
    summary: string;
    structuredNotes: {
      heading: string;
      points: string[];
    }[];
    qaPairs: {
      question: string;
      answer: string;
      marks: number; // 🔥 changed from 2 | 4
    }[];
  };
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function ResultsView({ data }: ResultsViewProps) {
  /* 🔥 GROUP QUESTIONS DYNAMICALLY BY MARKS */
  const groupedQuestions = data.qaPairs.reduce((acc, qa) => {
    const mark = qa.marks;

    if (!acc[mark]) {
      acc[mark] = [];
    }

    acc[mark].push(qa);
    return acc;
  }, {} as Record<number, typeof data.qaPairs>);

  const sortedMarks = Object.keys(groupedQuestions)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <motion.div className="space-y-8 max-w-5xl mx-auto">
      {/* Summary */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-primary" />
            <CardTitle>Executive Summary</CardTitle>
          </div>
          <CardDescription>Overview of the lecture</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-lg">{data.summary}</p>
        </CardContent>
      </Card>

      {/* Structured Notes */}
      <motion.div variants={item}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <List className="w-6 h-6 text-accent" />
              <CardTitle>Structured Notes</CardTitle>
            </div>
            <CardDescription>
              Key concepts broken down into digestible points
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-8">
            {data.structuredNotes.map((note, idx) => (
              <div
                key={idx}
                className="relative pl-6 border-l-2 border-accent/30"
              >
                <h4 className="text-xl font-bold mb-3">
                  {note.heading}
                </h4>

                <ul className="space-y-2">
                  {note.points.map((point, pIdx) => (
                    <li
                      key={pIdx}
                      className="flex gap-2 text-muted-foreground"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      {/* Exam Prep Q&A */}
      {sortedMarks.length > 0 && (
        <motion.div variants={item}>
          <Card className="bg-gradient-to-br from-white to-orange-50/50 border-orange-100">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <GraduationCap className="w-6 h-6 text-orange-500" />
                <CardTitle>Exam Prep Q&A</CardTitle>
              </div>
              <CardDescription>
                Practice questions categorized by marks
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="grid md:grid-cols-2 gap-8">
                {sortedMarks.map((mark) => (
                  <div key={mark}>
                    <h4 className="text-sm font-bold uppercase text-orange-500 mb-4">
                      {mark} Marks Questions
                    </h4>

                    <Accordion type="single" collapsible>
                      {groupedQuestions[mark].map((qa, idx) => (
                        <AccordionItem
                          key={idx}
                          value={`${mark}m-${idx}`}
                        >
                          <AccordionTrigger>
                            {qa.question}
                          </AccordionTrigger>
                          <AccordionContent>
                            {qa.answer}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Transcription */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-muted-foreground" />
            <CardTitle>Full Transcription</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-64 overflow-y-auto text-sm whitespace-pre-wrap">
            {data.transcription}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
