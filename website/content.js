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
    status: "Prototype · Private implementation",
    description:
      "Connecting face recognition, attendance records and everyday college workflows.",
    problem:
      "Recognising a face is only one step. Attendance also needs enrolment, review and useful records.",
    contribution:
      "Developing an attendance ERP prototype covering camera capture, enrolment, record review and reporting.",
    architecture: [
      {
        title: "Capture",
        text: "Capture camera frames for face recognition.",
      },
      {
        title: "Process",
        text: "Use computer vision to produce candidate matches.",
      },
      {
        title: "Record",
        text: "Connect matches to attendance records.",
      },
      {
        title: "Review",
        text: "Make records and reports available for review.",
      },
    ],
    evidence:
      "The linked repository is an earlier attendance prototype. The current ERP implementation is private.",
    limitations: [
      "Camera conditions affect recognition; uncertain matches need review.",
      "The diagram is illustrative. Student photos and attendance records stay private.",
    ],
    links: [
      {
        label: "Earlier public snapshot",
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
    status: "Research prototype · Private",
    description:
      "Exploring satellite imagery to flag possible oil spills for closer review.",
    problem:
      "A suspicious region in a satellite image needs a closer look before anyone can draw a conclusion.",
    contribution:
      "Comparing segmentation models in PyTorch, testing checkpoint recovery and running inference experiments.",
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
      "A private research prototype, illustrated here with synthetic imagery.",
    limitations: [
      "Screened regions are candidates for investigation, not confirmed oil spills.",
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
    status: "Hackathon demo",
    description:
      "Reusing past invoice resolutions to help review recurring payment exceptions.",
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
      "Example records are demonstration data, not client records.",
      "Suggestions need human review. The demo does not authorise or execute payments.",
    ],
    links: [
      { label: "View demo code", url: "https://github.com/VadlaHemanth/vendor-payment-memory-agent" },
    ],
  },
]);

export function getProject(id) {
  return PROJECTS.find((project) => project.id === id) ?? null;
}
