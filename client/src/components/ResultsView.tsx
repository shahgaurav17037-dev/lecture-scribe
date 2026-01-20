import { motion } from "framer-motion";
import { FileText, BookOpen, List, GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import type { structuredNoteItemSchema, qaPairItemSchema } from "@shared/schema";
import { z } from "zod";

interface ResultsViewProps {
  data: {
    transcription: string;
    summary: string;
    structuredNotes: z.infer<typeof structuredNoteItemSchema>[];
    qaPairs: z.infer<typeof qaPairItemSchema>[];
  };
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export function ResultsView({ data }: ResultsViewProps) {
  // Split Q&A into marks
  const twoMarkQuestions = data.qaPairs.filter(qa => qa.marks === 2);
  const fourMarkQuestions = data.qaPairs.filter(qa => qa.marks === 4);

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8 max-w-5xl mx-auto"
    >
      {/* Summary Section - Highlighted */}
      <motion.div variants={item}>
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <BookOpen className="w-6 h-6 text-primary" />
              <CardTitle>Executive Summary</CardTitle>
            </div>
            <CardDescription>A concise overview of the lecture content</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg leading-relaxed text-foreground/80">
              {data.summary}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Structured Notes */}
        <motion.div variants={item} className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <List className="w-6 h-6 text-accent" />
                <CardTitle>Structured Notes</CardTitle>
              </div>
              <CardDescription>Key concepts broken down into digestable points</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {data.structuredNotes.map((note, idx) => (
                <div key={idx} className="relative pl-6 border-l-2 border-accent/30">
                  <h4 className="text-xl font-bold mb-3 font-display">{note.heading}</h4>
                  <ul className="space-y-2">
                    {note.points.map((point, pIdx) => (
                      <li key={pIdx} className="text-muted-foreground flex gap-2">
                        <span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0 block" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Exam Questions */}
        <motion.div variants={item} className="lg:col-span-2">
          <Card className="bg-gradient-to-br from-white to-orange-50/50 border-orange-100">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <GraduationCap className="w-6 h-6 text-orange-500" />
                <CardTitle>Exam Prep Q&A</CardTitle>
              </div>
              <CardDescription>Practice questions to test your knowledge</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-orange-500 mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    Short Answer (2 Marks)
                  </h4>
                  <Accordion type="single" collapsible className="w-full">
                    {twoMarkQuestions.map((qa, idx) => (
                      <AccordionItem key={idx} value={`item-2-${idx}`}>
                        <AccordionTrigger className="text-left hover:no-underline hover:text-orange-600">
                          {qa.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-foreground/80">
                          {qa.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>

                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-orange-500 mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    Long Answer (4 Marks)
                  </h4>
                  <Accordion type="single" collapsible className="w-full">
                    {fourMarkQuestions.map((qa, idx) => (
                      <AccordionItem key={idx} value={`item-4-${idx}`}>
                        <AccordionTrigger className="text-left hover:no-underline hover:text-orange-600">
                          {qa.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-foreground/80">
                          {qa.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Transcription */}
        <motion.div variants={item} className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <FileText className="w-6 h-6 text-muted-foreground" />
                <CardTitle>Full Transcription</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-60 overflow-y-auto pr-4 text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap rounded-lg bg-muted/30 p-4 border border-border/50">
                {data.transcription}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
