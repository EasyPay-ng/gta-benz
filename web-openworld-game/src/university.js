// MetroVenture 3D — Metro Grand University: 1,140+ real-world academic courses,
// open enrollment & campus roleplay, live 24x lecture schedule, exams, transcripts
// and permanent career / startup multipliers. Zero DOM or Three.js dependencies.

import { wardrobeKey } from './customization.js';

export const DEGREE_LEVELS = [
  {
    id: 'cert',
    codeNum: 100,
    name: 'Foundation Certificate',
    short: 'Certificate',
    tuition: 0, // Merit Scholarship — free Day-1 access to all 228 disciplines!
    credits: 2,
    jobBoost: 0.06,
    bizBoost: 0.05,
    grant: 120,
    formatTitle: (subject) => `Foundation Certificate in ${subject}`,
    awardFor: () => 'Cert.',
  },
  {
    id: 'bachelor',
    codeNum: 300,
    name: "Bachelor's Degree",
    short: "Bachelor's",
    tuition: 280,
    credits: 3,
    jobBoost: 0.14,
    bizBoost: 0.11,
    grant: 320,
    formatTitle: (subject, deg) => `${deg} ${subject}`,
    awardFor: (fac) => fac.bachelorAward,
  },
  {
    id: 'honours',
    codeNum: 400,
    name: 'Applied Honours & Lab',
    short: 'Honours',
    tuition: 460,
    credits: 3,
    jobBoost: 0.18,
    bizBoost: 0.14,
    grant: 450,
    formatTitle: (subject, deg) => `${deg} (Hons) Applied ${subject}`,
    awardFor: (fac) => `${fac.bachelorAward} (Hons)`,
  },
  {
    id: 'masters',
    codeNum: 600,
    name: "Master's Degree",
    short: "Master's",
    tuition: 780,
    credits: 4,
    jobBoost: 0.24,
    bizBoost: 0.19,
    grant: 720,
    formatTitle: (subject, _b, mDeg) => `${mDeg} ${subject}`,
    awardFor: (fac) => fac.mastersAward,
  },
  {
    id: 'phd',
    codeNum: 800,
    name: 'Doctorate / Fellowship',
    short: 'Doctorate',
    tuition: 1350,
    credits: 5,
    jobBoost: 0.32,
    bizBoost: 0.25,
    grant: 1150,
    formatTitle: (subject, _b, _m, dDeg) => `${dDeg} ${subject}`,
    awardFor: (fac) => fac.phdAward,
  },
];

export const MAX_ACADEMIC_MULTIPLIER = 2.25; // up to +125% total pay / startup revenue bonus
export const LECTURE_STIPEND = 35;
export const STUDY_STIPEND = 25;

export const UNIVERSITY_FACULTIES = [
  {
    id: 'cs',
    code: 'CSC',
    icon: '💻',
    name: 'Computer Science, AI & Cybersecurity',
    hall: 'East Science & Tech Hall',
    color: '#2563eb',
    bachelorAward: 'BSc',
    mastersAward: 'MSc',
    phdAward: 'PhD',
    boostJobs: ['engineer'],
    boostBusinesses: ['tech'],
    generalBoost: 0.02,
    disciplines: [
      'Computer Science', 'Artificial Intelligence', 'Machine Learning', 'Deep Learning & Neural Networks',
      'Data Science & Big Data Analytics', 'Cybersecurity & Ethical Hacking', 'Software Engineering',
      'Cloud Computing & Virtualization', 'Distributed & Parallel Systems', 'Computer Vision & Image Processing',
      'Natural Language Processing', 'Robotics & Autonomous Systems', 'Blockchain & Decentralized Systems',
      'Game Engine & Real-Time Graphics', 'Operating Systems & Kernel Design', 'Compiler Construction & Languages',
      'Database Systems & Warehousing', 'Computer Networks & Protocols', 'Human-Computer Interaction',
      'Mobile & Ubiquitous Computing', 'DevOps & Site Reliability Engineering', 'Cryptography & Information Security',
      'Embedded & IoT Systems', 'Quantum Computing & Algorithms', 'Bioinformatics & Computational Biology',
    ],
    questions: [
      { q: 'What is the average time complexity of lookup in a well-distributed hash table?', opts: ['O(1)', 'O(n log n)', 'O(n²)', 'O(2ⁿ)'], a: 0 },
      { q: 'Which protocol provides encrypted transport security for HTTPS web traffic?', opts: ['TLS', 'ARP', 'ICMP', 'DHCP'], a: 0 },
      { q: 'In machine learning, holding out a test dataset primarily helps detect what problem?', opts: ['Overfitting', 'Disk fragmentation', 'Deadlock', 'DNS spoofing'], a: 0 },
      { q: 'Which data structure processes elements in First-In, First-Out (FIFO) order?', opts: ['Queue', 'Stack', 'Binary Heap', 'Trie'], a: 0 },
      { q: 'What does ACID stand for in relational database transactions?', opts: ['Atomicity, Consistency, Isolation, Durability', 'Async, Cached, Indexed, Distributed', 'Aligned, Compiled, Inline, Dynamic', 'Authorized, Ciphered, Immutable, Direct'], a: 0 },
    ],
  },
  {
    id: 'eng',
    code: 'ENG',
    icon: '⚙️',
    name: 'Engineering & Architecture',
    hall: 'East Science & Tech Hall',
    color: '#ea580c',
    bachelorAward: 'BEng',
    mastersAward: 'MEng',
    phdAward: 'PhD',
    boostJobs: ['mechanic', 'engineer'],
    boostBusinesses: ['garage', 'tech'],
    generalBoost: 0.02,
    disciplines: [
      'Mechanical Engineering', 'Civil & Structural Engineering', 'Electrical & Electronics Engineering',
      'Aerospace & Aeronautical Engineering', 'Automotive & Powertrain Engineering', 'Chemical & Process Engineering',
      'Mechatronics & Intelligent Robotics', 'Architecture & Sustainable Urban Design', 'Petroleum & Gas Engineering',
      'Biomedical & Clinical Engineering', 'Industrial & Operations Engineering', 'Environmental & Water Engineering',
      'Materials Science & Metallurgy', 'Renewable & Solar Energy Engineering', 'Marine & Offshore Engineering',
      'Telecommunications & RF Engineering', 'Control Systems & Automation', 'Geotechnical & Tunnel Engineering',
      'Structural Earthquake Engineering', 'Avionics & Spacecraft Propulsion', 'Acoustics & Vibration Engineering',
      'Nanotechnology & Microfabrication', 'Construction Engineering & Management', 'Quantity Surveying & Cost Engineering',
    ],
    questions: [
      { q: "According to Ohm's Law, voltage (V) across a resistor equals:", opts: ['Current × Resistance (I × R)', 'Current ÷ Resistance (I / R)', 'Power × Time (P × t)', 'Mass × Acceleration (m × a)'], a: 0 },
      { q: 'In structural engineering, reinforced concrete pairs concrete (strong in compression) with steel primarily to resist:', opts: ['Tensile stress', 'Thermal paint fade', 'Acoustic echo', 'Magnetic flux'], a: 0 },
      { q: 'Which thermodynamic cycle models a standard spark-ignition gasoline car engine?', opts: ['Otto cycle', 'Rankine steam cycle', 'Carnot refrigeration loop', 'Brayton jet-only loop'], a: 0 },
      { q: 'What does CAD stand for in engineering and architectural design?', opts: ['Computer-Aided Design', 'Central Axial Damper', 'Calibrated Alloy Density', 'Concrete Arch Deflection'], a: 0 },
    ],
  },
  {
    id: 'med',
    code: 'MED',
    icon: '🩺',
    name: 'Medicine, Nursing & Health Sciences',
    hall: 'East Science & Tech Hall',
    color: '#dc2626',
    bachelorAward: 'MBBS',
    mastersAward: 'MSc',
    phdAward: 'MD/PhD',
    boostJobs: ['security', 'chef', 'courier'],
    boostBusinesses: ['diner'],
    generalBoost: 0.04, // prestige boost across all jobs!
    disciplines: [
      'Medicine & Surgery', 'Nursing Science & Clinical Care', 'Pharmacy & Pharmaceutical Sciences',
      'Dentistry & Oral Maxillofacial Surgery', 'Physiotherapy & Physical Rehabilitation', 'Public Health & Epidemiology',
      'Medical Laboratory Science', 'Radiography & Diagnostic Imaging', 'Optometry & Vision Science',
      'Human Anatomy & Embryology', 'Human Physiology & Biophysics', 'Cardiovascular & Thoracic Science',
      'Neuroscience & Clinical Neurology', 'Pediatrics & Child Health', 'Immunology & Infectious Diseases',
      'Pharmacology & Toxicology', 'Clinical Nutrition & Dietetics', 'Veterinary Medicine & Surgery',
      'Psychiatry & Behavioral Medicine', 'Emergency & Trauma Care', 'Anesthesia & Critical Care',
      'Genetics & Genomic Medicine', 'Speech & Audiology Therapy', 'Occupational Therapy',
    ],
    questions: [
      { q: 'Which chamber of the human heart pumps oxygenated blood into the systemic aorta?', opts: ['Left ventricle', 'Right atrium', 'Right ventricle', 'Pulmonary vein'], a: 0 },
      { q: 'Which organ produces insulin to regulate blood glucose levels?', opts: ['Pancreas', 'Spleen', 'Gallbladder', 'Thyroid'], a: 0 },
      { q: 'Epidemiology is the branch of public health focused on studying:', opts: ['Patterns, causes and control of diseases in populations', 'Tooth enamel restoration', 'Optical lens refraction', 'Orthopedic cast plastering'], a: 0 },
      { q: 'Universal red-blood-cell donor status in emergency transfusions corresponds to blood group:', opts: ['O negative', 'AB positive', 'A positive', 'B positive'], a: 0 },
    ],
  },
  {
    id: 'biz',
    code: 'BUS',
    icon: '📈',
    name: 'Business, Economics & Finance',
    hall: 'Main Rotunda Amphitheatre',
    color: '#059669',
    bachelorAward: 'BBA',
    mastersAward: 'MBA',
    phdAward: 'DBA',
    boostJobs: ['dispatcher', 'cabbie', 'courier'],
    boostBusinesses: ['garage', 'diner', 'logistics', 'tech'],
    generalBoost: 0.03,
    disciplines: [
      'Business Administration & Strategy', 'Economics & Monetary Policy', 'Accounting & Financial Auditing',
      'Corporate Finance & Valuation', 'Investment Banking & Capital Markets', 'Entrepreneurship & Venture Capital',
      'Marketing & Consumer Brand Strategy', 'Supply Chain & Global Operations', 'Human Resource Management',
      'International Business & Global Trade', 'Actuarial Science & Risk Modeling', 'Real Estate & Urban Development',
      'Financial Technology (FinTech)', 'Business Analytics & Decision Science', 'Econometrics & Quantitative Economics',
      'Project & Portfolio Management', 'Taxation & Public Finance', 'Insurance & Enterprise Risk',
      'Luxury & Retail Management', 'E-Commerce & Digital Marketplaces', 'Hospitality & Resort Management',
      'Sports & Entertainment Management', 'Organizational Leadership', 'Development & Microfinance Economics',
    ],
    questions: [
      { q: 'On a company balance sheet, the fundamental accounting equation states:', opts: ['Assets = Liabilities + Equity', 'Revenue = Wages × Headcount', 'Cash = Debt − Taxes', 'Profit = Inventory + Goodwill'], a: 0 },
      { q: 'What economic term describes the value of the next best alternative foregone when making a choice?', opts: ['Opportunity cost', 'Sunk depreciation', 'Tariff parity', 'Liquidity trap'], a: 0 },
      { q: 'Diversifying an investment portfolio across uncorrelated assets primarily reduces:', opts: ['Unsystematic (asset-specific) risk', 'Corporate tax filings', 'Gross product weight', 'Fixed office rent'], a: 0 },
      { q: 'Net Profit equals Total Revenue minus:', opts: ['Total Expenses', 'Share Count', 'Market Cap', 'Accounts Receivable'], a: 0 },
    ],
  },
  {
    id: 'law',
    code: 'LAW',
    icon: '⚖️',
    name: 'Law, Criminology & Public Policy',
    hall: 'Main Rotunda Amphitheatre',
    color: '#7c3aed',
    bachelorAward: 'LLB',
    mastersAward: 'LLM',
    phdAward: 'PhD',
    boostJobs: ['security', 'dispatcher'],
    boostBusinesses: ['logistics', 'tech'],
    generalBoost: 0.03,
    disciplines: [
      'Law & Jurisprudence', 'Corporate & Commercial Law', 'Constitutional & Administrative Law',
      'Criminal Justice & Criminology', 'International Law & Global Diplomacy', 'Intellectual Property & Patent Law',
      'Maritime & Admiralty Law', 'Energy, Oil & Natural Resources Law', 'Human Rights & Humanitarian Law',
      'Taxation & Revenue Law', 'Arbitration & Conflict Resolution', 'Environmental & Climate Law',
      'Cybersecurity, AI & Data Privacy Law', 'Public Policy & Governance', 'Political Science & Statecraft',
      'International Relations & Foreign Affairs', 'Intelligence & National Security Studies', 'Forensic Criminology',
      'Banking & Securities Regulation', 'Labor & Industrial Relations Law',
    ],
    questions: [
      { q: 'In criminal law, the presumption of innocence means the burden of proof rests primarily on the:', opts: ['Prosecution', 'Jury clerk', 'Court stenographer', 'Witness bailiff'], a: 0 },
      { q: 'A legally binding contract generally requires offer, acceptance, intention, and:', opts: ['Consideration', 'Notarized wax seal', 'Newspaper publication', 'Parliamentary vote'], a: 0 },
      { q: 'Which branch of law governs inventions, trademarks, and original creative works?', opts: ['Intellectual Property Law', 'Admiralty Salvage Law', 'Probate Conveyancing', 'Municipal Zoning'], a: 0 },
      { q: 'Habeas corpus protects individuals against:', opts: ['Unlawful or arbitrary detention', 'Copyright expiration', 'Import customs duty', 'Corporate mergers'], a: 0 },
    ],
  },
  {
    id: 'sci',
    code: 'SCI',
    icon: '🔬',
    name: 'Natural & Physical Sciences',
    hall: 'East Science & Tech Hall',
    color: '#0891b2',
    bachelorAward: 'BSc',
    mastersAward: 'MSc',
    phdAward: 'PhD',
    boostJobs: ['engineer', 'mechanic'],
    boostBusinesses: ['tech', 'garage'],
    generalBoost: 0.025,
    disciplines: [
      'Physics', 'Astrophysics & Cosmology', 'Pure & Applied Mathematics', 'Statistics & Stochastic Modeling',
      'Organic & Synthetic Chemistry', 'Analytical & Physical Chemistry', 'Molecular & Cellular Biology',
      'Microbiology & Virology', 'Biochemistry & Structural Biology', 'Biotechnology & Genetic Engineering',
      'Geology & Earth Sciences', 'Geophysics & Seismology', 'Oceanography & Marine Biology',
      'Meteorology & Atmospheric Science', 'Ecology & Conservation Biology', 'Botany & Plant Physiology',
      'Zoology & Animal Behavior', 'Nuclear & Particle Physics', 'Environmental Chemistry', 'Hydrology & Water Science',
    ],
    questions: [
      { q: 'What is the approximate speed of light in a vacuum?', opts: ['3.0 × 10⁸ m/s', '343 m/s', '9.81 m/s²', '1.6 × 10⁻¹⁹ m/s'], a: 0 },
      { q: 'On the pH scale at 25 °C, a neutral aqueous solution has a pH of:', opts: ['7', '0', '14', '100'], a: 0 },
      { q: 'Which cellular organelle is the primary site of ATP energy synthesis in eukaryotes?', opts: ['Mitochondrion', 'Golgi apparatus', 'Lysosome', 'Centriole'], a: 0 },
      { q: 'The atomic number of an element is defined by the number of _____ in its nucleus.', opts: ['Protons', 'Neutrons', 'Valence shells', 'Photons'], a: 0 },
    ],
  },
  {
    id: 'arts',
    code: 'ART',
    icon: '🎨',
    name: 'Arts, Media, Film & Design',
    hall: 'West Grand Library',
    color: '#ec4899',
    bachelorAward: 'BA',
    mastersAward: 'MFA',
    phdAward: 'PhD',
    boostJobs: ['cabbie', 'chef', 'courier'],
    boostBusinesses: ['diner', 'tech'],
    generalBoost: 0.025,
    disciplines: [
      'Fine Arts & Studio Painting', 'Graphic & Brand Communication Design', 'Industrial & Product Design',
      'Fashion & Apparel Design', 'Interior Architecture & Spatial Design', 'Film & Television Directing',
      '3D Animation & Visual Effects', 'Music Composition & Sound Production', 'Journalism & Broadcast Media',
      'Photography & Cinematography', 'Theatre & Performing Arts', 'Creative Writing & Screenwriting',
      'User Experience (UX) & Interaction Design', 'Game Design & Interactive Media', 'Advertising & Public Relations',
      'Audio Engineering & Acoustics', 'Art History & Museum Curation', 'Documentary Media',
    ],
    questions: [
      { q: 'In subtractive vs. additive color theory, digital RGB displays create white by mixing:', opts: ['Red, Green and Blue light', 'Cyan, Charcoal and Ochre', 'Black and Silver ink', 'Ultraviolet and Infrared'], a: 0 },
      { q: 'In cinematography and photography, the "Rule of Thirds" is a guideline for:', opts: ['Visual composition and framing', 'Audio microphone impedance', 'Film stock chemical washing', 'Projector bulb wattage'], a: 0 },
      { q: 'Typography term "kerning" refers to adjusting the horizontal space between:', opts: ['Individual pairs of letters', 'Chapters in a novel', 'Camera lenses on a rig', 'Musical octaves'], a: 0 },
      { q: 'In UX design, a low-fidelity blueprint of page structure and layout is called a:', opts: ['Wireframe', 'Raytracer', 'Keystone', 'Chroma-key'], a: 0 },
    ],
  },
  {
    id: 'hum',
    code: 'HUM',
    icon: '🏛️',
    name: 'Humanities, Languages & Psychology',
    hall: 'West Grand Library',
    color: '#d97706',
    bachelorAward: 'BA',
    mastersAward: 'MA',
    phdAward: 'PhD',
    boostJobs: ['cabbie', 'security', 'courier'],
    boostBusinesses: ['diner', 'logistics'],
    generalBoost: 0.025,
    disciplines: [
      'History & World Civilizations', 'Philosophy, Logic & Ethics', 'Psychology & Cognitive Science',
      'Clinical & Counseling Psychology', 'Sociology & Social Change', 'Cultural & Social Anthropology',
      'Archaeology & Heritage Conservation', 'English Literature & Criticism', 'Linguistics & Phonetics',
      'Modern European & Global Languages', 'African Languages, Literature & Culture', 'Human Geography & GIS',
      'Comparative Religion & Theology', 'Social Work & Community Development', 'Library & Archival Information Science',
      'Mass Communication & Rhetoric', 'Demography & Urban Sociology', 'Classical & Ancient Studies',
    ],
    questions: [
      { q: 'In classical conditioning experiments, Ivan Pavlov demonstrated associative learning using:', opts: ['Salivating dogs and a neutral bell stimulus', 'Maze-running pigeons only', 'Prisms splitting sunlight', 'Pendulum clock oscillations'], a: 0 },
      { q: 'Linguistics sub-discipline "phonetics" studies:', opts: ['Physical production and perception of speech sounds', 'Ancient stone pottery glazes', 'Monetary inflation rates', 'Tectonic fault lines'], a: 0 },
      { q: 'In Historical methodology, an original letter or eyewitness diary written at the time of an event is a:', opts: ['Primary source', 'Tertiary encyclopedia', 'Fictionalized novel', 'Post-modern parody'], a: 0 },
      { q: 'GIS in geography and urban planning stands for:', opts: ['Geographic Information System', 'Global Isotope Spectrometer', 'General Inductive Syllogism', 'Graded Index Sensor'], a: 0 },
    ],
  },
  {
    id: 'edu',
    code: 'EDU',
    icon: '🎓',
    name: 'Education & Academic Leadership',
    hall: 'Main Rotunda Amphitheatre',
    color: '#4f46e5',
    bachelorAward: 'BEd',
    mastersAward: 'MEd',
    phdAward: 'EdD',
    boostJobs: ['engineer', 'security', 'chef'],
    boostBusinesses: ['garage', 'diner', 'logistics', 'tech'],
    generalBoost: 0.03,
    disciplines: [
      'Curriculum Design & Instruction', 'Educational Psychology & Learning Science', 'STEM Mathematics & Science Education',
      'Early Childhood & Primary Education', 'Educational Management & Policy Leadership', 'Special & Inclusive Education',
      'Higher Education Administration', 'Guidance & Career Counseling', 'Educational Technology & Digital Learning',
      'Adult & Lifelong Community Education', 'Literacy & Bilingual Language Education', 'Physical & Sports Education',
    ],
    questions: [
      { q: 'Formative assessment in education is conducted primarily to:', opts: ['Monitor student learning and give ongoing feedback during instruction', 'Rank campuses by land area', 'Replace all classroom textbooks', 'Audit cafeteria electricity bills'], a: 0 },
      { q: "Vygotsky's 'Zone of Proximal Development' describes tasks a learner can accomplish:", opts: ['With guidance and scaffolding before doing them independently', 'Only while asleep', 'Without any prior language', 'Exclusively via memorization'], a: 0 },
      { q: 'Instructional differentiation adapts teaching methods to accommodate:', opts: ['Diverse learner readiness, interests and needs', 'Building roof pitch angles', 'Bus fleet tyre pressure', 'Printer toner viscosity'], a: 0 },
    ],
  },
  {
    id: 'agri',
    code: 'AGR',
    icon: '🌿',
    name: 'Agriculture, Food & Culinary Science',
    hall: 'East Science & Tech Hall',
    color: '#16a34a',
    bachelorAward: 'BSc',
    mastersAward: 'MSc',
    phdAward: 'PhD',
    boostJobs: ['chef', 'dispatcher'],
    boostBusinesses: ['diner', 'logistics'],
    generalBoost: 0.02,
    disciplines: [
      'Agronomy & Crop Production', 'Food Science & Preservation Technology', 'Culinary Arts & Molecular Gastronomy',
      'Animal Science & Livestock Management', 'Agricultural Economics & Agribusiness', 'Soil Science & Fertility',
      'Fisheries & Marine Aquaculture', 'Forestry & Wildlife Conservation', 'Horticulture & Landscape Design',
      'Sustainable Climate-Smart Agriculture', 'Post-Harvest & Cold-Chain Engineering', 'Beverage & Fermentation Science',
    ],
    questions: [
      { q: 'Rotating nitrogen-fixing legumes with cereal crops primarily helps:', opts: ['Replenish soil nitrogen and break pest cycles', 'Increase asphalt hardness', 'Eliminate rainfall completely', 'Magnetize irrigation pipes'], a: 0 },
      { q: 'Pasteurization in food science applies controlled heat to:', opts: ['Eliminate harmful pathogens and extend shelf life', 'Turn proteins into plastics', 'Freeze-dry metal cans', 'Remove all water from salt'], a: 0 },
      { q: 'In culinary science, the Maillard reaction between amino acids and reducing sugars produces:', opts: ['Savory browning and complex roasted flavors', 'Ice crystal nucleation', 'Raw starch gelatinization', 'Carbonated fizz'], a: 0 },
    ],
  },
  {
    id: 'trans',
    code: 'TRN',
    icon: '✈️',
    name: 'Aviation, Maritime, Transport & Logistics',
    hall: 'Main Rotunda Amphitheatre',
    color: '#0284c7',
    bachelorAward: 'BSc',
    mastersAward: 'MSc',
    phdAward: 'PhD',
    boostJobs: ['courier', 'cabbie', 'dispatcher'],
    boostBusinesses: ['logistics', 'garage'],
    generalBoost: 0.025,
    disciplines: [
      'Commercial Aviation & Flight Operations', 'Air Traffic Control & Airspace Management',
      'Maritime Transport & Nautical Science', 'Port, Harbor & Terminal Operations',
      'Global Freight Forwarding & Supply Logistics', 'Urban Transit & Smart Mobility Planning',
      'Fleet Operations & Telematics Management', 'Motorsport & High-Performance Vehicle Dynamics',
      'Unmanned Aerial Vehicles (UAV) & Drone Logistics', 'Railway & High-Speed Corridor Engineering',
      'Customs, Cold-Chain & Trade Compliance', 'Aviation Safety & Accident Investigation',
    ],
    questions: [
      { q: 'In logistics, "last-mile delivery" refers to moving goods from a:', opts: ['Local distribution hub to the final customer destination', 'Mine shaft to an ocean freighter', 'Refinery to a pipeline', 'Factory press to a warehouse shelf'], a: 0 },
      { q: 'Which four forces act on an aircraft in steady flight?', opts: ['Lift, Weight, Thrust and Drag', 'Torque, Camber, Yaw and Octane', 'Draft, Ballast, Keel and Tide', 'Voltage, Resistance, Flux and Gain'], a: 0 },
      { q: 'Standard intermodal ocean shipping containers are measured globally in:', opts: ['TEUs (Twenty-foot Equivalent Units)', 'Carats', 'Bushels', 'Parsecs'], a: 0 },
    ],
  },
  {
    id: 'trades',
    code: 'TRD',
    icon: '🔧',
    name: 'Skilled Trades, Automotive & Applied Mastery',
    hall: 'East Science & Tech Hall',
    color: '#b45309',
    bachelorAward: 'BTech',
    mastersAward: 'MTech',
    phdAward: 'DTech',
    boostJobs: ['mechanic', 'chef', 'courier'],
    boostBusinesses: ['garage', 'diner'],
    generalBoost: 0.025,
    disciplines: [
      'Master Automotive Diagnostics & Tuning', 'Electric & Hybrid Vehicle Powertrains',
      'Collision Bodywork & Custom Clearcoat Refinishing', 'Precision CNC Machining & Fabrication',
      'Artisanal Patisserie & Master Culinary Craft', 'Commercial Electrical Power Installations',
      'HVAC, Chiller & Refrigeration Systems', 'Smart Building & Industrial PLC Automation',
      'Solar Photovoltaic & Microgrid Systems', 'Architectural Woodwork & Fine Cabinetry',
      'Welding, Metallurgy & NDT Inspection', 'Live Concert Audio, Lighting & Broadcast Rigging',
    ],
    questions: [
      { q: 'An OBD-II diagnostic scanner connects to a modern vehicle to read:', opts: ['Engine/chassis fault trouble codes and live sensor telemetry', 'Tyre tread paint color', 'Seat upholstery thread count', 'Windshield tint thickness'], a: 0 },
      { q: 'In electric and hybrid powertrains, regenerative braking recovers kinetic energy by using the traction motor as a:', opts: ['Generator to recharge the battery pack', 'Carburetor choke valve', 'Hydraulic clutch fan', 'Catalytic muffler'], a: 0 },
      { q: 'Before working on a high-voltage commercial electrical panel, standard safety protocol requires:', opts: ['Lockout / Tagout (LOTO) and verifying zero voltage', 'Increasing breaker amperage', 'Spraying water on busbars', 'Bypassing ground fault protection'], a: 0 },
    ],
  },
];

// Build the full 1,140 real-world academic course catalog once at module load.
export const UNIVERSITY_COURSES = [];
export const COURSE_BY_ID = Object.create(null);
export const FACULTY_BY_ID = Object.create(null);

for (const fac of UNIVERSITY_FACULTIES) {
  FACULTY_BY_ID[fac.id] = fac;
  fac.disciplines.forEach((subject, idx) => {
    const discNum = idx + 1;
    const slug = subject
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 32);

    for (const lvl of DEGREE_LEVELS) {
      const id = `${fac.id}_${slug}_${lvl.id}`;
      const code = `${fac.code}-${lvl.codeNum + discNum}`;
      const award = lvl.awardFor(fac);
      const title = lvl.formatTitle(subject, fac.bachelorAward, fac.mastersAward, fac.phdAward);
      const course = {
        id,
        code,
        title,
        subject,
        facultyId: fac.id,
        facultyName: fac.name,
        facultyIcon: fac.icon,
        facultyColor: fac.color,
        hall: fac.hall,
        levelId: lvl.id,
        levelName: lvl.name,
        levelShort: lvl.short,
        degreeAward: award,
        tuition: lvl.tuition,
        creditsRequired: lvl.credits,
        jobBoost: lvl.jobBoost,
        bizBoost: lvl.bizBoost,
        generalBoost: fac.generalBoost * (lvl.codeNum >= 600 ? 1.35 : 1),
        grant: lvl.grant,
        boostJobs: fac.boostJobs,
        boostBusinesses: fac.boostBusinesses,
        searchBlob: `${code} ${title} ${subject} ${fac.name} ${award} ${lvl.name}`.toLowerCase(),
      };
      UNIVERSITY_COURSES.push(course);
      COURSE_BY_ID[id] = course;
    }
  });
}

export function createAcademicState() {
  return {
    matricNo: 'MGU-2026-0101',
    activeCourseId: null,
    enrolledIds: [],
    creditsByCourse: {},
    completedIds: [],
    lecturesAttended: 0,
    studySessions: 0,
    gpa: 0,
    transcript: [], // [{ courseId, code, title, degreeAward, facultyId, day }]
  };
}

export function normalizeAcademicState(raw) {
  const base = createAcademicState();
  if (!raw || typeof raw !== 'object') return base;
  const enrolledIds = Array.isArray(raw.enrolledIds)
    ? Array.from(new Set(raw.enrolledIds.filter((id) => COURSE_BY_ID[id])))
    : [];
  const completedIds = Array.isArray(raw.completedIds)
    ? Array.from(new Set(raw.completedIds.filter((id) => COURSE_BY_ID[id])))
    : [];
  const creditsByCourse = {};
  if (raw.creditsByCourse && typeof raw.creditsByCourse === 'object') {
    for (const [k, v] of Object.entries(raw.creditsByCourse)) {
      if (COURSE_BY_ID[k] && Number.isFinite(v) && v > 0) {
        creditsByCourse[k] = Math.min(20, Math.floor(v));
      }
    }
  }
  const activeCourseId = raw.activeCourseId && COURSE_BY_ID[raw.activeCourseId]
    ? raw.activeCourseId
    : null;
  if (activeCourseId && !enrolledIds.includes(activeCourseId)) enrolledIds.push(activeCourseId);
  const transcript = Array.isArray(raw.transcript)
    ? raw.transcript.filter((t) => t && COURSE_BY_ID[t.courseId])
    : completedIds.map((id) => {
      const c = COURSE_BY_ID[id];
      return { courseId: id, code: c.code, title: c.title, degreeAward: c.degreeAward, facultyId: c.facultyId, day: 1 };
    });

  return {
    matricNo: typeof raw.matricNo === 'string' && raw.matricNo ? raw.matricNo : base.matricNo,
    activeCourseId,
    enrolledIds,
    creditsByCourse,
    completedIds,
    lecturesAttended: Number.isFinite(raw.lecturesAttended) ? Math.max(0, Math.floor(raw.lecturesAttended)) : 0,
    studySessions: Number.isFinite(raw.studySessions) ? Math.max(0, Math.floor(raw.studySessions)) : 0,
    gpa: Number.isFinite(raw.gpa) ? Math.max(0, Math.min(4.0, Number(raw.gpa))) : (completedIds.length ? 3.85 : 0),
    transcript,
  };
}

export function searchCourses({
  query = '',
  facultyId = 'all',
  levelId = 'all',
  status = 'all',
  state = null,
  limit = 24,
  offset = 0,
} = {}) {
  const q = String(query || '').trim().toLowerCase();
  const terms = q ? q.split(/\s+/).filter(Boolean) : [];
  const acad = state?.academic;
  const enrolledSet = acad ? new Set(acad.enrolledIds) : null;
  const completedSet = acad ? new Set(acad.completedIds) : null;

  const matched = [];
  for (let i = 0; i < UNIVERSITY_COURSES.length; i++) {
    const c = UNIVERSITY_COURSES[i];
    if (facultyId && facultyId !== 'all' && c.facultyId !== facultyId) continue;
    if (levelId === 'free') {
      if (c.tuition > 0) continue;
    } else if (levelId && levelId !== 'all' && c.levelId !== levelId) {
      continue;
    }
    if (status === 'enrolled' && (!enrolledSet || !enrolledSet.has(c.id))) continue;
    if (status === 'completed' && (!completedSet || !completedSet.has(c.id))) continue;
    if (terms.length) {
      let ok = true;
      for (let t = 0; t < terms.length; t++) {
        if (!c.searchBlob.includes(terms[t])) { ok = false; break; }
      }
      if (!ok) continue;
    }
    matched.push(c);
  }
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  return {
    total: matched.length,
    offset: safeOffset,
    items: matched.slice(safeOffset, safeOffset + safeLimit),
  };
}

export function enrollCourse(state, courseId) {
  const course = COURSE_BY_ID[courseId];
  if (!course) return { ok: false, msg: 'Unknown academic course.' };
  if (!state.academic) state.academic = createAcademicState();
  const acad = state.academic;

  const alreadyEnrolled = acad.enrolledIds.includes(courseId) || acad.completedIds.includes(courseId);
  const fee = alreadyEnrolled ? 0 : course.tuition;
  if (state.cash < fee) {
    return {
      ok: false,
      msg: `You need $${fee.toLocaleString()} tuition to enroll in ${course.code} ${course.title} (or pick any Free Merit Scholarship course!).`,
    };
  }
  if (fee > 0) state.cash -= fee;
  if (!acad.enrolledIds.includes(courseId)) acad.enrolledIds.push(courseId);
  acad.activeCourseId = courseId;
  if (!acad.gpa) acad.gpa = 3.6;

  return {
    ok: true,
    tuitionPaid: fee,
    course,
    msg: alreadyEnrolled
      ? `🎓 Active major switched to ${course.code}: ${course.title}.`
      : fee === 0
        ? `🎓 Enrolled on Merit Scholarship ($0) in ${course.code}: ${course.title}!`
        : `🎓 Enrolled in ${course.code}: ${course.title} (-$${fee.toLocaleString()} tuition).`,
  };
}

export function getLiveCampusSchedule(inGameMs = 0) {
  const hour = Math.floor(((inGameMs / 3_600_000) % 24 + 24) % 24);
  const day = Math.max(1, Math.floor(inGameMs / 86_400_000) + 1);
  const seedBase = day * 37 + Math.floor(hour / 2) * 13;
  const pickFrom = (facIds, salt) => {
    const fac = FACULTY_BY_ID[facIds[(seedBase + salt) % facIds.length]];
    const facCourses = UNIVERSITY_COURSES.filter((c) => c.facultyId === fac.id);
    return facCourses[(seedBase * 7 + salt * 19) % facCourses.length];
  };
  const mainCourse = pickFrom(['biz', 'law', 'edu', 'trans'], 1);
  const labCourse = pickFrom(['cs', 'eng', 'med', 'sci', 'agri', 'trades'], 2);
  const libCourse = pickFrom(['arts', 'hum', 'biz', 'cs'], 3);
  const slotStart = `${String(hour - (hour % 2)).padStart(2, '0')}:00`;
  const slotEnd = `${String((hour - (hour % 2) + 2) % 24).padStart(2, '0')}:00`;
  return [
    { venue: 'Main Rotunda Amphitheatre', window: `${slotStart}–${slotEnd}`, course: mainCourse },
    { venue: 'East Science & Medical Lab', window: `${slotStart}–${slotEnd}`, course: labCourse },
    { venue: 'West Grand Library Seminar', window: `${slotStart}–${slotEnd}`, course: libCourse },
  ];
}

export function attendLecture(state, { inGameMs = 0 } = {}) {
  if (!state.academic) state.academic = createAcademicState();
  const acad = state.academic;

  // Open roleplay: if player hasn't picked a major yet, auto-enroll them in a Free Scholarship course from live schedule!
  if (!acad.activeCourseId) {
    const live = getLiveCampusSchedule(inGameMs)[0]?.course;
    const freeFallback = UNIVERSITY_COURSES.find((c) => c.subject === live?.subject && c.tuition === 0) || UNIVERSITY_COURSES[0];
    acad.enrolledIds.push(freeFallback.id);
    acad.activeCourseId = freeFallback.id;
  }

  const course = COURSE_BY_ID[acad.activeCourseId];
  const prev = acad.creditsByCourse[course.id] || 0;
  const next = Math.min(course.creditsRequired, prev + 1);
  acad.creditsByCourse[course.id] = next;
  acad.lecturesAttended += 1;
  acad.gpa = Math.min(4.0, Math.round(((acad.gpa || 3.6) + 0.04) * 100) / 100);
  state.cash += LECTURE_STIPEND;
  state.stats.totalEarned = (state.stats.totalEarned || 0) + LECTURE_STIPEND;

  const ready = next >= course.creditsRequired && !acad.completedIds.includes(course.id);
  return {
    ok: true,
    course,
    credits: next,
    creditsRequired: course.creditsRequired,
    stipend: LECTURE_STIPEND,
    readyForExam: ready,
    msg: ready
      ? `🎓 Lecture complete (${next}/${course.creditsRequired} credits) +$${LECTURE_STIPEND}! You are ready to sit the ${course.code} Final Exam!`
      : `📚 Attended ${course.code} lecture (${next}/${course.creditsRequired} credits) +$${LECTURE_STIPEND} attendance stipend.`,
  };
}

export function studySession(state, { spot = 'West Grand Library' } = {}) {
  if (!state.academic) state.academic = createAcademicState();
  const acad = state.academic;
  if (!acad.activeCourseId) {
    const starter = UNIVERSITY_COURSES[0];
    acad.enrolledIds.push(starter.id);
    acad.activeCourseId = starter.id;
  }
  const course = COURSE_BY_ID[acad.activeCourseId];
  const prev = acad.creditsByCourse[course.id] || 0;
  const next = Math.min(course.creditsRequired, prev + 1);
  acad.creditsByCourse[course.id] = next;
  acad.studySessions += 1;
  acad.gpa = Math.min(4.0, Math.round(((acad.gpa || 3.6) + 0.03) * 100) / 100);
  state.cash += STUDY_STIPEND;
  state.stats.totalEarned = (state.stats.totalEarned || 0) + STUDY_STIPEND;
  const ready = next >= course.creditsRequired && !acad.completedIds.includes(course.id);
  return {
    ok: true,
    course,
    credits: next,
    creditsRequired: course.creditsRequired,
    stipend: STUDY_STIPEND,
    readyForExam: ready,
    msg: `📖 Completed research & study session in ${spot} (${next}/${course.creditsRequired} credits) +$${STUDY_STIPEND}!`,
  };
}

// Deterministic per-course 3-question exam with shuffled options so correct answer isn't always A!
export function getExamQuestions(courseId) {
  const course = COURSE_BY_ID[courseId];
  if (!course) return [];
  const fac = FACULTY_BY_ID[course.facultyId];
  const pool = fac.questions;
  let hash = 2166136261;
  for (let i = 0; i < courseId.length; i++) {
    hash ^= courseId.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const picked = [];
  for (let k = 0; k < 3; k++) {
    const rawQ = pool[(hash + k * 3 + Math.floor(hash / 17)) % pool.length];
    const order = [0, 1, 2, 3];
    // Deterministic Fisher-Yates shuffle of answer options
    let s = (hash + k * 7919) >>> 0;
    for (let i = 3; i > 0; i--) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const j = s % (i + 1);
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    picked.push({
      q: rawQ.q,
      prompt: rawQ.q,
      options: order.map((idx) => rawQ.opts[idx]),
      correctIndex: order.indexOf(rawQ.a),
    });
  }
  return picked;
}

export function submitCourseExam(state, courseId, answers = [], currentDay = 1) {
  const course = COURSE_BY_ID[courseId];
  if (!course) return { ok: false, msg: 'Unknown course.' };
  if (!state.academic) state.academic = createAcademicState();
  const acad = state.academic;

  const questions = getExamQuestions(courseId);
  let correct = 0;
  for (let i = 0; i < questions.length; i++) {
    if (Number(answers[i]) === questions[i].correctIndex) correct += 1;
  }
  const credits = acad.creditsByCourse[courseId] || 0;
  const fullCredits = credits >= course.creditsRequired;
  const minNeeded = fullCredits ? 1 : 2; // attending all lectures gives continuous-assessment cushion!
  const passed = correct >= minNeeded;

  if (!passed) {
    return {
      ok: false,
      passed: false,
      correct,
      total: questions.length,
      msg: `📝 Scored ${correct}/${questions.length} on ${course.code}. Attend lectures for coursework credit or review & retry anytime!`,
    };
  }

  const firstTime = !acad.completedIds.includes(courseId);
  const honours = correct === 3 ? 'Summa Cum Laude' : correct === 2 ? 'Magna Cum Laude' : 'Cum Laude';
  if (firstTime) {
    acad.completedIds.push(courseId);
    acad.creditsByCourse[courseId] = Math.max(credits, course.creditsRequired);
    acad.transcript.unshift({
      courseId: course.id,
      code: course.code,
      title: course.title,
      degreeAward: course.degreeAward,
      facultyId: course.facultyId,
      facultyName: course.facultyName,
      honours,
      score: correct,
      total: questions.length,
      day: currentDay || state.stats?.day || 1,
    });
    state.cash += course.grant;
    state.stats.totalEarned = (state.stats.totalEarned || 0) + course.grant;

    // Unlock Academic Convocation Gown & Graduation Mortarboard Cap in Wardrobe!
    if (Array.isArray(state.wardrobe)) {
      const gownKey = wardrobeKey('top', 'gown');
      const capKey = wardrobeKey('hat', 'mortarboard');
      if (!state.wardrobe.includes(gownKey)) state.wardrobe.push(gownKey);
      if (!state.wardrobe.includes(capKey)) state.wardrobe.push(capKey);
    }
  }
  if (!acad.enrolledIds.includes(courseId)) acad.enrolledIds.push(courseId);
  acad.gpa = Math.min(4.0, Math.round((Math.max(3.65, acad.gpa || 3.7) + (correct === 3 ? 0.12 : 0.05)) * 100) / 100);

  return {
    ok: true,
    passed: true,
    firstTime,
    correct,
    total: questions.length,
    grant: firstTime ? course.grant : 0,
    course,
    msg: firstTime
      ? `🎓 CONGRATULATIONS! Awarded ${course.degreeAward} in ${course.subject} (${correct}/${questions.length})! +$${course.grant.toLocaleString()} Fellowship Grant & Graduation Cap + Gown unlocked!`
      : `🎓 Passed ${course.code} Honours Re-Sit (${correct}/${questions.length})!`,
  };
}

// Compute permanent career pay multiplier for an occupation from completed degrees.
// Takes the highest degree earned per discipline so stacking across diverse fields is super rewarding!
export function academicJobMultiplier(state, occId) {
  const completed = state?.academic?.completedIds;
  if (!Array.isArray(completed) || !completed.length) return 1;
  const bestBySubject = new Map();
  for (const id of completed) {
    const c = COURSE_BY_ID[id];
    if (!c) continue;
    const matchesOcc = c.boostJobs.includes(occId);
    const bonus = matchesOcc ? c.jobBoost : c.generalBoost;
    const key = `${c.facultyId}:${c.subject}`;
    if (bonus > (bestBySubject.get(key) || 0)) bestBySubject.set(key, bonus);
  }
  let sum = 0;
  for (const v of bestBySubject.values()) sum += v;
  return Math.min(MAX_ACADEMIC_MULTIPLIER, 1 + sum);
}

// Compute permanent startup revenue multiplier for a business from completed degrees.
export function academicBusinessMultiplier(state, bizId) {
  const completed = state?.academic?.completedIds;
  if (!Array.isArray(completed) || !completed.length) return 1;
  const bestBySubject = new Map();
  for (const id of completed) {
    const c = COURSE_BY_ID[id];
    if (!c) continue;
    const matchesBiz = c.boostBusinesses.includes(bizId);
    const bonus = matchesBiz ? c.bizBoost : c.generalBoost * 0.6;
    const key = `${c.facultyId}:${c.subject}`;
    if (bonus > (bestBySubject.get(key) || 0)) bestBySubject.set(key, bonus);
  }
  let sum = 0;
  for (const v of bestBySubject.values()) sum += v;
  return Math.min(MAX_ACADEMIC_MULTIPLIER, 1 + sum);
}
