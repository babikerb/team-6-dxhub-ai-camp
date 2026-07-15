// Snapshot of SDSU IT's approved software catalog (https://it.sdsu.edu/apps-software).
// Used to short-circuit the intake form when a requester's software need is already
// covered by something SDSU already provides.
export const SDSU_CATALOG = [
  { name: "ArcGIS", developer: "ESRI", description: "Cloud-based software to create and share interactive web maps.", category: "Cloud Computing", url: "https://it.sdsu.edu/apps-software/arcgis", aliases: ["gis", "mapping software", "geographic information system"] },
  { name: "Azure", developer: "Microsoft", description: "Cloud access, developer resources, and learning materials.", category: "Cloud Computing", url: "https://it.sdsu.edu/apps-software/azure", aliases: ["microsoft azure", "azure cloud", "cloud hosting"] },
  { name: "Camtasia", developer: "Techsmith", description: "Software for creating and recording video tutorials and presentations.", category: "Design", url: "https://it.sdsu.edu/apps-software/camtasia", aliases: ["screen recording software", "video tutorial software"] },
  { name: "Canvas", developer: "Instructure", description: "Learning management system built to make teaching and learning easier.", category: "Learning Management", url: "https://it.sdsu.edu/apps-software/canvas", aliases: ["lms", "learning management system", "blackboard", "moodle", "brightspace", "d2l"] },
  { name: "ChatGPT", developer: "OpenAI", description: "Advanced conversational AI language model.", category: "Artificial Intelligence", url: "https://it.sdsu.edu/services/research/research-services/chatgpt-profile", aliases: ["gpt", "openai", "chat gpt", "ai chatbot"] },
  { name: "Copilot", developer: "Microsoft", description: "AI assistant for work using large language models and web information.", category: "Artificial Intelligence", url: "https://it.sdsu.edu/services/research/research-services/copilot-profile", aliases: ["microsoft copilot", "github copilot", "ai assistant"] },
  { name: "Creative Cloud", developer: "Adobe", description: "Applications and services for graphic design, video editing, web development, and photography.", category: "Design", url: "https://it.sdsu.edu/apps-software/adobe-creative-cloud", aliases: ["adobe", "photoshop", "illustrator", "premiere", "premiere pro", "indesign", "after effects", "lightroom", "acrobat"] },
  { name: "Duo Security", developer: "Duo", description: "Two-factor authentication solution.", category: "Security and Compliance", url: "https://it.sdsu.edu/apps-software/duo-security", aliases: ["duo", "two factor authentication", "2fa", "mfa", "authenticator"] },
  { name: "EndNote", developer: "Clarivate", description: "Reference management software to manage bibliographies and references.", category: "Reference Management", url: "https://it.sdsu.edu/apps-software/endnote", aliases: ["zotero", "mendeley", "reference manager", "citation manager"] },
  { name: "FastX XWin32", developer: "Starnet", description: "Remote Linux X Windows display solution.", category: "Desktop & Mobile Computing", url: "https://it.sdsu.edu/apps-software/fastx-xwin32", aliases: ["x windows", "remote linux display", "xwin32"] },
  { name: "Gemini", developer: "Google", description: "Direct access to Google AI for writing, planning, and learning.", category: "Artificial Intelligence", url: "https://it.sdsu.edu/services/research/research-services/gemini-profile", aliases: ["google gemini", "google ai", "bard"] },
  { name: "Globus", developer: "Globus", description: "Secure data management service to transfer, share, and access large-scale datasets.", category: "Data Analysis and Programming", url: "https://it.sdsu.edu/services/research/research-services/globus-profile", aliases: ["file transfer", "large dataset transfer", "globus connect"] },
  { name: "Google Workspace", developer: "Google", description: "Cloud computing, productivity, and collaboration tools.", category: "Communication & Collaboration", url: "https://it.sdsu.edu/apps-software/google-workspace", aliases: ["google docs", "google sheets", "google slides", "gmail", "google drive", "google calendar", "google forms", "g suite"] },
  { name: "Gradescope", developer: "Turnitin", description: "Helps instructors grade problem sets and other assignments more quickly and consistently.", category: "Learning Management", url: "https://it.sdsu.edu/apps-software/gradescope", aliases: ["grading software", "assignment grading"] },
  { name: "MATLAB", developer: "MathWorks", description: "High-performance programming environment for numerical computing and data analysis.", category: "Data Analysis and Programming", url: "https://it.sdsu.edu/services/research/research-services/matlab-profile", aliases: ["numerical computing", "simulink"] },
  { name: "Mediasite", developer: "Sonic Foundry", description: "Video and media platform to create, manage, and distribute video content.", category: "Communication & Collaboration", url: "https://it.sdsu.edu/apps-software/mediasite", aliases: ["video hosting", "lecture capture"] },
  { name: "Microsoft 365", developer: "Microsoft", description: "Create, share, and collaborate with Word, Excel, PowerPoint, Outlook, and more.", category: "Business Application", url: "https://it.sdsu.edu/apps-software/microsoft-365", aliases: ["office 365", "microsoft word", "microsoft excel", "microsoft powerpoint", "microsoft outlook", "onedrive", "microsoft teams", "ms office"] },
  { name: "Modern Campus CMS", developer: "SDSU IT", description: "Web content management system operated by IT's Web Services group.", category: "Cloud Computing", url: "https://it.sdsu.edu/services/research/research-services/modern-campus-cms-profile", aliases: ["cms", "content management system", "website builder", "wordpress"] },
  { name: "NVivo", developer: "Lumivero", description: "Qualitative data analysis software for research insights.", category: "Data Analysis and Programming", url: "https://it.sdsu.edu/apps-software/nvivo", aliases: ["qualitative data analysis", "atlas.ti"] },
  { name: "Poll Everywhere", developer: "Poll Everywhere", description: "Web-based audience response system for live activities in presentations.", category: "Communication & Collaboration", url: "https://it.sdsu.edu/apps-software/poll-everywhere", aliases: ["kahoot", "mentimeter", "clicker", "live polling", "audience response"] },
  { name: "Qualtrics", developer: "IBM", description: "Cloud-based platform to design, distribute, and analyze surveys and feedback.", category: "Survey and Data Collection", url: "https://it.sdsu.edu/services/research/research-services/qualtrics-profile", aliases: ["surveymonkey", "google forms", "survey tool", "survey software"] },
  { name: "SAS", developer: "SAS Software", description: "Analytics suite to manage data, perform statistical analyses, and generate insights.", category: "Data Analysis and Programming", url: "https://it.sdsu.edu/services/research/research-services/sas-profile", aliases: ["statistical analysis", "stata"] },
  { name: "ServiceNow", developer: "ServiceNow", description: "Define, manage, automate, and structure IT services.", category: "Business Application", url: "https://it.sdsu.edu/apps-software/servicenow", aliases: ["ticketing system", "it service management", "helpdesk software", "jira service desk"] },
  { name: "Snagit", developer: "TechSmith", description: "Screen capture and screen recording software for Windows and macOS.", category: "Design", url: "https://it.sdsu.edu/apps-software/snagit", aliases: ["screenshot tool", "screen capture"] },
  { name: "SPSS", developer: "IBM", description: "Statistical analysis tool for data management and complex analyses.", category: "Data Analysis and Programming", url: "https://it.sdsu.edu/services/research/research-services/spss-profile", aliases: ["statistical analysis", "stata"] },
  { name: "Turnitin", developer: "Turnitin", description: "Internet-based similarity detection service.", category: "Security and Compliance", url: "https://it.sdsu.edu/apps-software/turnitin", aliases: ["plagiarism checker", "plagiarism detection", "similarity detection"] },
  { name: "WeVideo", developer: "WeVideo", description: "Adds real-time questions and interactions to video content.", category: "Communication & Collaboration", url: "https://it.sdsu.edu/apps-software/wevideo", aliases: ["video editor", "video creation"] },
  { name: "Zoom", developer: "Zoom Video Communications", description: "Consolidates communications and helps people connect and collaborate.", category: "Communication & Collaboration", url: "https://it.sdsu.edu/apps-software/zoom", aliases: ["webex", "google meet", "video conferencing", "teams meeting"] },
];

function normalize(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
}

// Returns catalog entries that plausibly satisfy the requester's stated software
// need, ranked by confidence. Matches on exact/substring name hits and on the
// aliases list (so "Google Docs" surfaces "Google Workspace", etc).
export function matchCatalog(query) {
  const q = normalize(query || "");
  if (q.length < 3) return [];

  const scored = [];
  for (const entry of SDSU_CATALOG) {
    const name = normalize(entry.name);
    let score = 0;

    // Substring checks require a minimum length so short names/aliases (e.g. "SAS",
    // "word") don't false-match unrelated software that merely contains those letters
    // (e.g. "Kansas", "Wordament") — only an exact typed match should flag those.
    if (q === name) score = Math.max(score, 100);
    else if (name.length >= 4 && (q.includes(name) || name.includes(q))) score = Math.max(score, 80);

    for (const alias of entry.aliases) {
      const a = normalize(alias);
      if (q === a) score = Math.max(score, 90);
      else if (a.length >= 5 && (q.includes(a) || a.includes(q))) score = Math.max(score, 60);
    }

    if (score > 0) scored.push({ ...entry, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}
