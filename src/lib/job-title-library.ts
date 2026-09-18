/**
 * Common job titles, offered as the job title is typed and as the templates
 * the job post editor can write — the library Workable draws on, trimmed to
 * the roles an agency like Convertt actually hires for, plus the office roles
 * every company needs. Convertt's own titles are offered first; these fill in
 * everything it has not hired for yet.
 */
export const JOB_TITLE_LIBRARY: string[] = [
  // Design
  'Graphic Designer', 'Senior Graphic Designer', 'Junior Graphic Designer', 'UI Designer', 'UX Designer',
  'UI/UX Designer', 'Senior UI/UX Designer', 'Junior UI/UX Designer', 'Product Designer', 'Web Designer',
  'Visual Designer', 'Motion Graphics Designer', 'Brand Designer', 'Creative Director', 'Art Director',
  'Video Editor', 'Senior Video Editor', 'Junior Video Editor', 'Illustrator', '3D Designer',
  // Development
  'Frontend Developer', 'Senior Frontend Developer', 'Backend Developer', 'Full Stack Developer',
  'Senior Full Stack Developer', 'Shopify Developer', 'Senior Shopify Developer', 'Shopify Theme Developer',
  'WordPress Developer', 'Webflow Developer', 'React Developer', 'Next.js Developer', 'Node.js Developer',
  'PHP Developer', 'Laravel Developer', 'Python Developer', 'Mobile App Developer', 'Flutter Developer',
  'iOS Developer', 'Android Developer', 'Software Engineer', 'Senior Software Engineer', 'Junior Software Engineer',
  'QA Engineer', 'Automation QA Engineer', 'Manual QA Tester', 'DevOps Engineer', 'Technical Lead',
  'Engineering Manager', 'Web Developer', 'AI Engineer', 'Machine Learning Engineer', 'Data Engineer', 'AI Intern',
  // CRO, growth and marketing
  'CRO Strategist', 'CRO Specialist', 'Conversion Rate Optimization Manager', 'A/B Testing Specialist',
  'Growth Marketer', 'Growth Manager', 'Digital Marketing Executive', 'Digital Marketing Manager',
  'Performance Marketing Manager', 'Meta Ads Expert', 'Google Ads Specialist', 'PPC Specialist',
  'Paid Media Specialist', 'SEO Specialist', 'SEO Executive', 'SEO Manager', 'Content Writer', 'Copywriter',
  'Senior Copywriter', 'Content Strategist', 'Content Marketing Manager', 'Social Media Manager',
  'Social Media Executive', 'Social Media Designer', 'Community Manager', 'Email Marketing Specialist',
  'Marketing Manager', 'Marketing Executive', 'Brand Manager', 'Creative Marketing Associate',
  'Marketing Intern', 'Influencer Marketing Manager', 'Ecommerce Manager', 'Ecommerce Specialist',
  'Amazon Account Manager', 'Data Analyst', 'Marketing Analyst', 'Web Analytics Specialist',
  // Sales and clients
  'Business Development Executive', 'Business Development Manager', 'Senior Business Development Executive',
  'Sales Executive', 'Sales Manager', 'Inside Sales Representative', 'Sales Development Representative',
  'Lead Generation Specialist', 'Account Manager', 'Senior Account Manager', 'Key Account Manager',
  'Account Executive', 'Client Success Manager', 'Customer Success Manager', 'Customer Support Representative',
  'Customer Service Representative', 'Business Partnerships & Growth Executive', 'Partnerships Manager',
  'Proposal Writer', 'Upwork Bidder',
  // Projects and operations
  'Project Coordinator', 'Project Manager', 'Senior Project Manager', 'Technical Project Manager',
  'Product Manager', 'Product Owner', 'Scrum Master', 'Operations Executive', 'Operations Manager',
  'Delivery Manager', 'Team Lead', 'Chief Operating Officer',
  // Finance
  'Accounts Officer', 'Accountant', 'Senior Accountant', 'Accounts Executive', 'Accounts Payable Officer',
  'Accounts Receivable Officer', 'Financial Analyst', 'Finance Manager', 'Finance Executive', 'Bookkeeper',
  'Payroll Officer', 'Tax Officer', 'Internal Auditor', 'Chief Financial Officer',
  // People and admin
  'HR Executive', 'HR Officer', 'HR Manager', 'HR Business Partner', 'HR Generalist', 'HR Intern',
  'Talent Acquisition Specialist', 'Recruiter', 'Technical Recruiter', 'People Operations Executive',
  'Admin Officer', 'Office Administrator', 'Office Manager', 'Executive Assistant', 'Personal Assistant',
  'Receptionist', 'Front Desk Officer', 'Office Boy', 'Driver', 'Security Guard',
  // IT
  'IT Support Officer', 'IT Administrator', 'Network Administrator', 'System Administrator',
]

/** Library titles that share a word with the text, most words shared first. */
export function relatedTitles(text: string, limit = 15): string[] {
  const words = text.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length >= 2)
  if (!words.length) return []
  return JOB_TITLE_LIBRARY
    .map((t) => {
      const lower = t.toLowerCase()
      const shared = words.filter((w) => lower.includes(w)).length
      return { t, shared, starts: lower.startsWith(words[0]) ? 1 : 0 }
    })
    .filter((x) => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || b.starts - a.starts || a.t.length - b.t.length)
    .slice(0, limit)
    .map((x) => x.t)
}
