/** Public case-study copy. Private code and personal records stay off-site. */
export const PROFILE = Object.freeze({
  name: "Vadla Hemanth",
  displayName: "VADLA HEMANTH",
  location: "Hyderabad, India",
  github: "https://github.com/VadlaHemanth",
  linkedin: "https://www.linkedin.com/in/vadlahemanth/",
  kaggle: "https://www.kaggle.com/hemanthvadla",
  resume: "./resume.html",
  resumeDownload: "./assets/Vadla-Hemanth-Resume.pdf",
});

export const PROJECTS = Object.freeze([
  {
    id: "attendance",
    number: "02",
    title: "Attendance ERP",
    subtitle: "Automatic Attendance System",
    category: "Computer vision / Full-stack systems",
    status: "In-progress prototype. The code is private.",
    description:
      "A college attendance system where recognising a face is only the first step.",
    problem:
      "Attendance also needs enrolment, records that people can check, and reports. I’m building those parts too.",
    contribution:
      "My work spans the vision pipeline, application data, background processing and testing.",
    architecture: [
      {
        title: "Capture",
        text: "Camera frames come in for recognition.",
      },
      {
        title: "Match",
        text: "InsightFace suggests likely matches among enrolled students.",
      },
      {
        title: "Record",
        text: "Each match becomes an attendance record.",
      },
      {
        title: "Review",
        text: "A person checks uncertain matches. Records feed the reports.",
      },
    ],
    evidence:
      "The ERP code is private. The public repository is an earlier, simpler attendance prototype, not the current implementation.",
    limitations: [
      "Camera conditions affect recognition, so uncertain matches need review.",
      "Student photos and attendance records stay private.",
    ],
    links: [
      {
        label: "Earlier prototype on GitHub",
        url: "https://github.com/Vadla-Hemanth/Automatic-Attendance-System",
      },
    ],
  },
  {
    id: "satellite",
    number: "01",
    title: "Satellite research",
    subtitle: "Oil-spill screening",
    category: "Applied AI / Geospatial research",
    status: "Research prototype. The code is private.",
    description:
      "Screening satellite images for possible oil spills, so a person knows where to look more closely.",
    problem:
      "A suspicious region in a satellite image needs a closer look before anyone can draw a conclusion.",
    contribution:
      "Compared segmentation models in PyTorch, exported a model for CPU inference and added checkpoints so training can resume.",
    architecture: [
      {
        title: "Observe",
        text: "Start with satellite imagery.",
      },
      {
        title: "Screen",
        text: "Highlight candidate regions with image analysis.",
      },
      {
        title: "Context",
        text: "Consider each region alongside supporting information.",
      },
      {
        title: "Investigate",
        text: "Leave the final interpretation to a human reviewer.",
      },
    ],
    evidence:
      "A private research prototype. The illustration is synthetic, not real imagery.",
    limitations: [
      "A flagged region is a lead to investigate, not a confirmed oil spill.",
      "Imagery alone cannot establish which vessel was responsible.",
    ],
    links: [],
  },
  {
    id: "memory",
    number: "03",
    title: "Vendor Payment",
    subtitle: "Memory Agent",
    category: "Agent systems / Workflow design",
    status: "Hackathon demo. The code is public.",
    description:
      "A hackathon demo that remembers how earlier invoice exceptions were resolved, and suggests a next step for a person to approve.",
    problem:
      "Recurring invoice exceptions often mean searching for the same resolution again.",
    contribution:
      "Built a FastAPI demo that recalls past resolutions, checks GSTIN, HSN and purchase-order fields, and suggests a next step for human review.",
    architecture: [
      {
        title: "Receive",
        text: "Start with an invoice exception.",
      },
      {
        title: "Recall",
        text: "Retrieve context through Hindsight or a local JSONL fallback.",
      },
      {
        title: "Suggest",
        text: "Use earlier resolutions to suggest an approach.",
      },
      {
        title: "Review",
        text: "Leave the decision with a human reviewer.",
      },
    ],
    evidence:
      "Public hackathon demo using example invoices and vendors.",
    limitations: [
      "It runs on example invoices and vendors, not client records.",
      "A person makes every decision. The demo does not authorise or execute payments.",
    ],
    links: [
      { label: "Code on GitHub", url: "https://github.com/VadlaHemanth/vendor-payment-memory-agent" },
    ],
  },
]);

export function getProject(id) {
  return PROJECTS.find((project) => project.id === id) ?? null;
}
