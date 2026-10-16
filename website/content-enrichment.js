/** Public projects and experience. Build-time metadata is never shown as copy. */

const checkedOn = "2026-10-03";

export const PROJECTS = Object.freeze([
  {
    id: "attendance-public",
    title: "Automatic Attendance System",
    subtitle: "Earlier public prototype",
    category: "Computer vision",
    status: "Historical prototype",
    description:
      "An earlier prototype connecting face recognition with classroom attendance records.",
    tags: ["Python", "Flask", "Computer vision"],
    caseFacts: [
      "This public snapshot is separate from the current private Attendance ERP implementation.",
    ],
    links: [
      {
        label: "Public repository",
        url: "https://github.com/Vadla-Hemanth/Automatic-Attendance-System",
        verifiedAt: checkedOn,
      },
    ],
    evidenceStatus: "evidence",
  },
  {
    id: "vendor-memory",
    title: "Vendor Payment Memory Agent",
    subtitle: "Learning from recurring invoice exceptions",
    category: "Agent systems",
    status: "Hackathon demo",
    description:
      "Recalling earlier invoice resolutions to support human review.",
    tags: ["Python", "FastAPI", "Hindsight", "JSONL"],
    caseFacts: [
      "Hindsight memory with a local JSONL fallback, plus GSTIN, HSN and purchase-order checks.",
      "Uses example records. Suggestions need human review; the demo does not execute payments.",
    ],
    links: [
      {
        label: "Public repository",
        url: "https://github.com/VadlaHemanth/vendor-payment-memory-agent",
        verifiedAt: checkedOn,
      },
    ],
    evidenceStatus: "evidence",
  },
  {
    id: "drive-uploader",
    title: "Drive media uploader",
    subtitle: "Resumable media transfer",
    category: "Web applications",
    status: "Self-hosted tool",
    featured: true,
    description:
      "Browser-to-Drive uploads with chunking, retry and resume.",
    tags: ["FastAPI", "JavaScript", "Rclone", "Resumable uploads"],
    caseFacts: [
      "Chunked uploads, a virtualized file list and progress feedback.",
      "Local or tunnel access, with a QR code to open the uploader on a phone.",
    ],
    links: [
      {
        label: "Code",
        url: "https://github.com/VadlaHemanth/gdrive-photo-uploader",
        verifiedAt: checkedOn,
      },
    ],
    evidenceStatus: "evidence",
  },
  {
    id: "proofa",
    title: "Proofa",
    subtitle: "From learning to a résumé",
    category: "Frontend prototypes",
    status: "Frontend prototype",
    featured: true,
    description:
      "A place to collect project work and prepare a résumé.",
    tags: ["React", "TypeScript", "Vite", "Tailwind CSS"],
    caseFacts: [
      "Onboarding, a proof locker, planning and résumé flows.",
      "Verification responses are partly simulated; the companion is rule-based.",
    ],
    links: [
      {
        label: "Code",
        url: "https://github.com/VadlaHemanth/proofa",
        verifiedAt: checkedOn,
      },
    ],
    evidenceStatus: "evidence",
  },
  {
    id: "portfolio-public",
    title: "Earlier portfolio",
    subtitle: "A published web presentation",
    category: "Web design",
    status: "Earlier version",
    description:
      "An earlier React portfolio, published on GitHub Pages.",
    tags: ["React", "Vite", "Tailwind CSS", "Framer Motion"],
    caseFacts: [
      "React, Vite, Tailwind CSS and Framer Motion.",
    ],
    links: [
      {
        label: "Code",
        url: "https://github.com/Vadla-Hemanth/portfolio",
        verifiedAt: checkedOn,
      },
      {
        label: "Visit",
        url: "https://vadla-hemanth.github.io/portfolio/",
        verifiedAt: checkedOn,
      },
    ],
    evidenceStatus: "evidence",
  },
  {
    id: "serverless-web",
    title: "EduPeak",
    subtitle: "Serverless online-tuition website",
    category: "Web applications",
    status: "Web project",
    description:
      "An online-tuition website using serverless hosting and APIs.",
    tags: ["Cloudflare Pages", "Cloudflare Workers", "APIs"],
    caseFacts: [
      "Development work with Cloudflare Pages, Workers and API integration.",
    ],
    links: [
      { label: "Visit", url: "https://tuition-platform.pages.dev/", verifiedAt: checkedOn },
    ],
    evidenceStatus: "user-stated",
  },
  {
    id: "data-structures-study-tool",
    title: "Data structures tracker",
    subtitle: "Source-linked revision",
    category: "Learning tools",
    status: "Study tool",
    featured: true,
    description:
      "Topic-based question banks with sources and revision progress.",
    tags: ["JavaScript", "Syllabus mapping", "Responsive UI"],
    caseFacts: [
      "Unit filters, question variants, source references and editable progress.",
    ],
    links: [
      { label: "Open", url: "https://ds-question-tracker.pages.dev/", verifiedAt: checkedOn },
    ],
    evidenceStatus: "evidence",
  },
  {
    id: "drawing-study-tool",
    title: "Drawing & CAD tracker",
    subtitle: "Questions, diagrams, and solution navigation",
    category: "Learning tools",
    status: "Study tool",
    featured: true,
    description:
      "Drawing questions, diagrams and solutions in one study view.",
    tags: ["HTML", "JavaScript", "Technical diagrams"],
    caseFacts: [
      "Expandable topics, source labels and mobile-friendly solution navigation.",
    ],
    links: [
      { label: "Open", url: "https://engineering-drawing-tracker.pages.dev/", verifiedAt: checkedOn },
    ],
    evidenceStatus: "evidence",
  },
]);

export const EXPERIENCE = Object.freeze([
  {
    id: "institutional-software",
    title: "College workflow development",
    category: "Engineering experience",
    status: "Private prototype",
    description:
      "Developing attendance workflows for enrolment, record review and reporting.",
    tags: ["Computer vision", "Backend workflows", "Testing"],
    caseFacts: [
      "My focus is requirements, testing and iteration; the implementation stays private.",
    ],
    links: [],
    evidenceStatus: "evidence",
    relatedProjectId: "attendance-public",
    countAsSeparateProject: false,
  },
  {
    id: "satellite-research",
    title: "Satellite-image research",
    category: "Applied ML experience",
    status: "Research prototype",
    description:
      "Comparing segmentation models, recovering checkpoints and running inference experiments in PyTorch.",
    tags: ["PyTorch", "Segmentation", "Geospatial analysis"],
    caseFacts: [
      "Candidate regions need human interpretation. Research code stays private.",
    ],
    links: [],
    evidenceStatus: "evidence",
  },
  {
    id: "institutional-web",
    title: "Institution-facing website design",
    category: "Web design experience",
    status: "Web project",
    description:
      "Building responsive pages, themes and navigation for an education-software concept.",
    tags: ["Next.js", "TypeScript", "Tailwind CSS", "Static export"],
    caseFacts: ["Next.js, TypeScript and Tailwind CSS, with static export."],
    links: [],
    evidenceStatus: "evidence",
  },
  {
    id: "design-content",
    title: "Digital design for UME Interiors",
    category: "Creative experience",
    status: "Design work",
    description:
      "Creating promotional posters, web banners and landing-page content for UME Interiors.",
    tags: ["Graphic design", "Web content", "Visual communication"],
    caseFacts: [],
    links: [
      { label: "Business website", url: "https://www.umeinteriors.com/", verifiedAt: checkedOn },
    ],
    evidenceStatus: "user-stated",
  },
  {
    id: "english-study-tool",
    title: "English study tooling",
    category: "Learning tools",
    status: "Study tool",
    description:
      "Organising English questions, answers and source labels in a topic-based progress tracker.",
    tags: ["HTML", "JavaScript", "Content organization"],
    caseFacts: [],
    links: [],
    evidenceStatus: "evidence",
  },
  {
    id: "academic-planning",
    title: "Academic planning tools",
    category: "Personal software",
    status: "Personal tool",
    description:
      "Bringing study tasks, calendars and syllabus coverage into a browser-based planner.",
    tags: ["JavaScript", "localStorage", "Information design"],
    caseFacts: [
      "Progress and plans are stored locally in the browser.",
    ],
    links: [],
    evidenceStatus: "evidence",
  },
  {
    id: "provider-interoperability",
    title: "AI-provider interoperability",
    category: "Developer tooling",
    status: "Experiment",
    description:
      "Experimenting with streaming APIs and tool-call compatibility for AI-assisted coding.",
    tags: ["Python", "ASGI", "HTTPX", "Streaming APIs"],
    caseFacts: ["Provider setup and code remain private."],
    links: [],
    evidenceStatus: "evidence",
  },
  {
    id: "engineering-workflow",
    title: "AI-assisted engineering workflow",
    category: "Process design",
    status: "Working practice",
    description:
      "Writing requirements, handoff notes, test plans and recovery steps.",
    tags: ["Technical writing", "Review", "Reproducibility"],
    caseFacts: [
      "Turning an open-ended prompt into a specification, then reviewing the result.",
    ],
    links: [],
    evidenceStatus: "user-stated",
  },
  {
    id: "schedule-proposal",
    title: "Project-report automation",
    category: "Exploration",
    status: "Proposal",
    description:
      "Proposing a way to turn field reports into schedule updates for a planner to review.",
    tags: ["Workflow design", "Human review", "Technical proposals"],
    caseFacts: ["Concept and presentation work, with duplicate checks and human approval."],
    links: [],
    evidenceStatus: "aspiration",
  },
  {
    id: "assessment-proposal",
    title: "Security-assessment workflows",
    category: "Exploration",
    status: "Proposal",
    description:
      "Proposing an offline workflow to flag missing evidence in exported security records.",
    tags: ["Evidence quality", "Offline workflows", "Technical proposals"],
    caseFacts: ["An analysis concept for examiner review, not a deployed service."],
    links: [],
    evidenceStatus: "aspiration",
  },
  {
    id: "study-documentation",
    title: "Source-linked learning resources",
    category: "Technical communication",
    status: "Study resources",
    description:
      "Creating source-linked guides and worked explanations for programming, databases, computing and mathematics.",
    tags: ["Java", "DBMS", "Software engineering", "Computer organization", "Digital logic"],
    caseFacts: [
      "AI-assisted notes and worked explanations, organised by topic.",
    ],
    links: [],
    evidenceStatus: "evidence",
  },
  {
    id: "government-proposals",
    title: "Institutional proposal preparation",
    category: "Technical communication",
    status: "Proposal preparation",
    description:
      "Preparing problem statements, architecture diagrams, budgets and deployment plans for innovation-program proposals.",
    tags: ["Presentations", "Technical writing", "Budget planning"],
    caseFacts: [
      "Presentation and application documents, formatted for portal requirements.",
    ],
    links: [],
    evidenceStatus: "evidence",
  },
  {
    id: "technical-events",
    title: "Technical event leadership",
    category: "Campus experience",
    status: "Event coordination",
    description:
      "Helped organise and lead CodeMania and C Hunt technical events at NNRG.",
    tags: ["Event coordination", "Teamwork", "Communication"],
    caseFacts: [],
    links: [],
    evidenceStatus: "user-stated",
  },
  {
    id: "model-un",
    title: "Model United Nations",
    category: "Campus experience",
    status: "Participation",
    description: "Participated as a delegate at NNRG MUN 2026.",
    tags: ["Public speaking", "Discussion"],
    caseFacts: [],
    links: [],
    evidenceStatus: "user-stated",
  },
  {
    id: "math-poster",
    title: "Mathematics and machine-intelligence poster",
    category: "Creative experience",
    status: "Poster presentation",
    description:
      "Prepared a National Mathematics Day poster on mathematics and machine intelligence.",
    tags: ["Technical posters", "Visual explanation"],
    caseFacts: [],
    links: [],
    evidenceStatus: "user-stated",
  },
  {
    id: "hackathonz",
    title: "HackathonZ — Hack2Hire",
    category: "Hackathon experience",
    status: "Participation",
    description:
      "Took part in HackathonZ — Hack2Hire at Malla Reddy University, building and presenting with a team.",
    tags: ["Teamwork", "Prototyping", "Presentation"],
    caseFacts: [
      "Learning to scope a prototype and respond to feedback under time constraints.",
    ],
    links: [],
    evidenceStatus: "user-stated",
  },
  {
    id: "hackathon-preparation",
    title: "Hackathon research and demo preparation",
    category: "Hackathon experience",
    status: "Team preparation",
    description:
      "Leading a student team through problem research, prototype planning and demo preparation.",
    tags: ["Research", "Prototyping", "Demo storytelling"],
    caseFacts: [
      "Preparing proposals and presentation scripts.",
    ],
    links: [],
    evidenceStatus: "evidence",
  },
  {
    id: "campus-web-redesign",
    title: "College-site redesign study",
    category: "Web design experience",
    status: "Design study",
    description:
      "Exploring a college-site redesign with typed components, clear navigation and purposeful motion.",
    tags: ["React", "TypeScript", "Tailwind CSS", "GSAP"],
    caseFacts: ["An independent design study."],
    links: [],
    evidenceStatus: "user-stated",
  },
  {
    id: "visual-c-programming",
    title: "Visual C-programming material",
    category: "Technical communication",
    status: "Visual explainer",
    description:
      "Using Excalidraw to explain introductory C programming through diagrams.",
    tags: ["C", "Excalidraw", "Visual teaching"],
    caseFacts: [],
    links: [],
    evidenceStatus: "user-stated",
  },
  {
    id: "school-tutoring",
    title: "School-level tutoring",
    category: "Teaching experience",
    status: "Tutoring",
    description:
      "Supporting school-level learners with explanations and study guidance.",
    tags: ["Tutoring", "Explanation", "Learning support"],
    caseFacts: [],
    links: [],
    evidenceStatus: "user-stated",
  },
  {
    id: "event-communication",
    title: "Technical-event communication",
    category: "Creative experience",
    status: "Writing & editing",
    description:
      "Editing workshop descriptions and feedback messages to make their purpose and next steps clear.",
    tags: ["Editing", "Event copy", "Technical communication"],
    caseFacts: [
      "Copy about AI-portfolio and wireless-technology programmes.",
    ],
    links: [],
    evidenceStatus: "user-stated",
  },
  {
    id: "creative-media",
    title: "Video and image editing",
    category: "Creative experience",
    status: "Creative practice",
    description:
      "Editing short videos and images with standard tools, FFmpeg and AI assistance.",
    tags: ["Video editing", "Image editing", "FFmpeg"],
    caseFacts: [],
    links: [],
    evidenceStatus: "user-stated",
  },
  {
    id: "portfolio-motion",
    title: "Motion-led portfolio storytelling",
    category: "Creative experience",
    status: "Creative direction",
    description:
      "Storyboarding this portfolio’s journey from a portrait into a visual world of computing.",
    tags: ["Storyboarding", "Motion direction", "Visual narrative"],
    caseFacts: [],
    links: [],
    evidenceStatus: "user-stated",
    relatedProjectId: "portfolio-public",
    countAsSeparateProject: false,
  },
  {
    id: "exam-support-exploration",
    title: "Exam-support platform exploration",
    category: "Exploration",
    status: "Concept",
    description:
      "Exploring course access and enrolment flows for a student tuition platform.",
    tags: ["Education technology", "Enrollment UX", "Product requirements"],
    caseFacts: [
      "Product requirements and interface exploration.",
    ],
    links: [],
    evidenceStatus: "aspiration",
    countAsSeparateProject: false,
  },
  {
    id: "cloud-experimentation",
    title: "Cloud deployment and troubleshooting",
    category: "Engineering experience",
    status: "Hands-on exploration",
    description:
      "Deploying web and AI prototypes, troubleshooting hosting and tunnels, and setting up background Drive sync.",
    tags: ["Cloudflare", "Cloud VMs", "Deployment", "Troubleshooting", "Rclone", "systemd"],
    caseFacts: [
      "Cloudflare, cloud VMs, Rclone and systemd.",
    ],
    links: [],
    evidenceStatus: "user-stated",
    countAsSeparateProject: false,
  },
  {
    id: "faculty-timetable-automation",
    title: "Faculty timetable automation",
    category: "Document automation",
    status: "Document automation",
    description:
      "Using Python to turn master Excel timetables into individual faculty documents in Excel, Word and PDF.",
    tags: ["Python", "Spreadsheet automation", "Document generation"],
    caseFacts: [
      "Includes merged cells, colour coding and page breaks. Timetable conflicts remain visible for review.",
    ],
    links: [],
    evidenceStatus: "evidence",
  },
]);

/** Six entry points; the individual activities remain available on expansion. */
export const EXPERIENCE_GROUPS = Object.freeze([
  {
    id: "product-workflows",
    title: "Product & workflow development",
    description: "Requirements, college workflows and document automation.",
    members: ["institutional-software", "faculty-timetable-automation"],
  },
  {
    id: "research-tooling",
    title: "Research & developer tools",
    description: "Model experiments, APIs and hands-on deployment.",
    members: [
      "satellite-research",
      "provider-interoperability",
      "engineering-workflow",
      "cloud-experimentation",
    ],
  },
  {
    id: "design-communication",
    title: "Design & communication",
    description: "Web layouts, visual explainers and motion.",
    members: [
      "institutional-web",
      "design-content",
      "campus-web-redesign",
      "math-poster",
      "event-communication",
      "creative-media",
      "portfolio-motion",
    ],
  },
  {
    id: "learning-teaching",
    title: "Learning & teaching",
    description: "Study tools, programming notes and tutoring.",
    members: [
      "english-study-tool",
      "academic-planning",
      "study-documentation",
      "visual-c-programming",
      "school-tutoring",
    ],
  },
  {
    id: "campus-collaboration",
    title: "Campus & hackathons",
    description: "Organising events and building with a team.",
    members: ["technical-events", "model-un", "hackathonz", "hackathon-preparation"],
  },
  {
    id: "proposal-writing",
    title: "Technical proposals",
    description: "Problem statements, diagrams and plans to test.",
    members: [
      "schedule-proposal",
      "assessment-proposal",
      "government-proposals",
      "exam-support-exploration",
    ],
  },
]);

export const EDUCATION = Object.freeze([
  {
    id: "iitm",
    institution: "Indian Institute of Technology Madras",
    shortName: "IIT Madras",
    program: "BS in Data Science and Applications",
    start: "April 2025",
    expectedCompletion: "2029",
    stage: "current",
    status: "Currently studying",
    description: "Undergraduate study in data science and applications.",
    evidenceStatus: "user-stated",
  },
  {
    id: "nnrg",
    institution: "Nalla Narasimha Reddy Education Society's Group of Institutions",
    shortName: "NNRG",
    program: "B.Tech in Computer Science",
    start: "August 2025",
    expectedCompletion: "2029",
    stage: "current",
    status: "Currently studying",
    description: "Undergraduate study in computer science.",
    evidenceStatus: "user-stated",
  },
  {
    id: "intermediate",
    institution: "SR Junior College",
    program: "Intermediate",
    start: null,
    expectedCompletion: null,
    stage: "previous",
    status: "Completed",
    description: "Intermediate education at SR Junior College.",
    evidenceStatus: "user-stated",
  },
  {
    id: "school",
    institution: "St Peters School",
    program: "Class 10",
    start: null,
    expectedCompletion: null,
    stage: "previous",
    status: "Completed",
    description: "Class 10 at St Peters School.",
    evidenceStatus: "user-stated",
  },
]);

export const SOURCE_SUMMARY = Object.freeze({
  status: "final-reviewed",
  checkedOn,
  projectCount: PROJECTS.length,
  experienceCount: EXPERIENCE.length,
  educationCount: EDUCATION.length,
  publicRepositoryCount: 8,
  originalProjectRepositoryCount: 5,
  publicSiteProjectCount: 3,
  profiles: [
    {
      label: "Primary GitHub",
      url: "https://github.com/Vadla-Hemanth",
      verifiedAt: checkedOn,
      publicRepositoryCount: 3,
    },
    {
      label: "Additional GitHub",
      url: "https://github.com/VadlaHemanth",
      verifiedAt: checkedOn,
      publicRepositoryCount: 5,
    },
  ],
});

export const namesToAnonymize = Object.freeze([]);
