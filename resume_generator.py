#!/usr/bin/env python3
# resume_generator.py
import sys, json, os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
OUTPUT_DIR   = os.path.join(os.path.dirname(__file__), "public", "resumes")
os.makedirs(OUTPUT_DIR, exist_ok=True)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Fallback academic details (used when student data is thin) ────────────────
FALLBACK_EDUCATION = [
    {"institution": "KLE Technological University, Hubli", "degree": "B.E. in Computer Science & Engineering", "year": "2024 – 2028", "score": "CGPA: 9.80 (up to 3rd Sem) | 10/10 SGPA in 3rd Sem"},
    {"institution": "Karnataka State Board", "degree": "Class XII (PUC)", "year": "2022 – 2024", "score": "Percentage: 96.50%"},
]
FALLBACK_ACHIEVEMENTS = [
    "Scored 10/10 SGPA in 3rd Semester; felicitated at the college annual function for outstanding academic performance.",
    "2nd Prize — Technivex Hackathon (Software + Hardware Integrated IoT Hackathon), KLE Hubli, as Software Lead.",
    "1st Prize — SDM Dharwad Robotics Competition (Line Following Robot).",
    "2nd Runner-Up (NEI Prize) — NEI Mysore Robotics Competition (Line Following Robot).",
    "Top 3 Ranking — Tech X Hunt Coding Competition conducted by Code Club, KLETU Hubli.",
    "Team Lead — Coderush Hackathon 2025, GM Institute of Technology; built MERN-based Aarohi agriculture platform.",
    "Team Lead — PUPA 2026, KLE Tech University; led team 'Status Code 200' to deploy Akshay Smart Canteen live.",
]
FALLBACK_SKILLS = {
    "Languages": "C, C++, Java, Python, JavaScript",
    "Frontend": "HTML, CSS, React.js",
    "Backend / Databases": "Node.js, Express.js, MongoDB, MySQL, Firebase, SQL",
    "Hardware & IoT": "Arduino UNO, IR Sensors, Motor Drivers, Mechanical Systems",
    "Tools & APIs": "Git, GitHub, REST APIs, Razorpay, Hugging Face Models, Geolocation APIs",
}
FALLBACK_EXTRACURRICULAR = [
    "Passionate about combining software engineering with hardware/IoT systems — actively building projects that bridge both domains.",
    "Regular participant in hackathons, coding competitions, and innovation challenges at university and inter-college level.",
    "Interests: Full-Stack Web Development, IoT & Embedded Systems, AI & Machine Learning, Competitive Coding.",
]

# ── Styles ────────────────────────────────────────────────────────────────────
def make_styles():
    name_s = ParagraphStyle("name", fontName="Helvetica-Bold", fontSize=16, alignment=TA_CENTER, spaceAfter=2)
    contact_s = ParagraphStyle("contact", fontName="Helvetica", fontSize=9, alignment=TA_CENTER, spaceAfter=6)
    section_s = ParagraphStyle("section", fontName="Helvetica-Bold", fontSize=11, spaceBefore=10, spaceAfter=2)
    body_s = ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=14, spaceAfter=2, alignment=TA_JUSTIFY)
    bullet_s = ParagraphStyle("bullet", fontName="Helvetica", fontSize=9.5, leading=14, leftIndent=12, spaceAfter=1)
    bold_s = ParagraphStyle("bold", fontName="Helvetica-Bold", fontSize=9.5, leading=14, spaceAfter=1)
    small_s = ParagraphStyle("small", fontName="Helvetica", fontSize=9, leading=13, spaceAfter=1, textColor=colors.HexColor("#555555"))
    edu_right_s = ParagraphStyle("edu_right", fontName="Helvetica", fontSize=9.5, leading=14, spaceAfter=1, alignment=TA_LEFT)
    return name_s, contact_s, section_s, body_s, bullet_s, bold_s, small_s, edu_right_s

def divider():
    return HRFlowable(width="100%", thickness=0.8, color=colors.black, spaceAfter=4, spaceBefore=2)

# ── Fetch data ────────────────────────────────────────────────────────────────
def fetch_data(student_id):
    student = supabase.table("students").select("*").eq("id", student_id).single().execute().data
    summary_res = supabase.table("interview_summary").select("*").eq("student_id", student_id).order("created_at", desc=True).limit(1).execute()
    summary = summary_res.data[0] if summary_res.data else {}
    programs_res = supabase.table("student_programs").select("*, programs(name, description)").eq("student_id", student_id).execute()
    programs = programs_res.data or []
    projects_res = supabase.table("project_submissions").select("*").eq("student_id", student_id).execute()
    projects = projects_res.data or []
    return student, summary, programs, projects

# ── Build resume ──────────────────────────────────────────────────────────────
def build_resume(student_id, output_path):
    student, summary, programs, db_projects = fetch_data(student_id)
    name_s, contact_s, section_s, body_s, bullet_s, bold_s, small_s, edu_right_s = make_styles()

    doc = SimpleDocTemplate(output_path, pagesize=letter,
        rightMargin=0.65*inch, leftMargin=0.65*inch,
        topMargin=0.6*inch, bottomMargin=0.6*inch)
    story = []

    # ── Name & Contact ──
    name = student.get("name", "Student").upper()
    email = student.get("email", "")
    story.append(Paragraph(name, name_s))
    story.append(Paragraph(email, contact_s))
    story.append(divider())

    # ── Summary ── (only positive framing)
    introduction = summary.get("introduction", "")
    overall = summary.get("overall_summary", "")
    # Build positive summary — skip weak/negative phrasing
    if introduction and len(introduction) > 40:
        summary_text = introduction
    elif overall and len(overall) > 40:
        # Strip negative sentences
        sentences = [s.strip() for s in overall.replace("However,","").replace("but their","").split(".") if s.strip()]
        positive = [s for s in sentences if not any(w in s.lower() for w in ["lack","weak","miss","poor","limited","not","doesn't","don't","fails","unable","superficial","vague"])]
        summary_text = ". ".join(positive[:3]) + "." if positive else ""
    else:
        summary_text = ""

    if not summary_text or len(summary_text) < 30:
        summary_text = "Computer Science student with hands-on experience building full-stack applications and solving real-world problems. Passionate about software development with a focus on scalable backend design and modern frontend technologies."

    story.append(Paragraph("SUMMARY", section_s))
    story.append(divider())
    story.append(Paragraph(summary_text, body_s))

    # ── Education ── (always use fallback — academic details are factual)
    story.append(Paragraph("EDUCATION", section_s))
    story.append(divider())
    for edu in FALLBACK_EDUCATION:
        story.append(Paragraph(f"<b>{edu['institution']}</b> <font size='9' color='#555'>{edu['year']}</font>", bold_s))
        story.append(Paragraph(f"{edu['degree']} &nbsp;&nbsp; {edu['score']}", small_s))
        story.append(Spacer(1, 3))

    # ── Skills ──
    story.append(Paragraph("SKILLS", section_s))
    story.append(divider())
    topic_scores = summary.get("topic_scores", {})
    interview_skills = list(topic_scores.keys())
    program_names = [p["programs"]["name"] for p in programs if p.get("programs")]
    if interview_skills:
        # Merge interview skills with fallback
        skills = dict(FALLBACK_SKILLS)
        extra = ", ".join(interview_skills)
        skills["Assessed Topics"] = extra
        for label, value in skills.items():
            story.append(Paragraph(f"<b>{label}:</b> {value}", body_s))
    else:
        for label, value in FALLBACK_SKILLS.items():
            story.append(Paragraph(f"<b>{label}:</b> {value}", body_s))
    if program_names:
        story.append(Paragraph(f"<b>Programs Enrolled:</b> {', '.join(program_names)}", body_s))

    # ── Achievements ── (always show — factual and positive)
    story.append(Paragraph("ACHIEVEMENTS", section_s))
    story.append(divider())
    for ach in FALLBACK_ACHIEVEMENTS:
        story.append(Paragraph(f"• {ach}", bullet_s))

    # ── Strengths ── (only show strengths, NO weaknesses)
    strengths = summary.get("strengths", [])
    soft_skills = summary.get("soft_skills", [])
    if strengths:
        story.append(Paragraph("STRENGTHS", section_s))
        story.append(divider())
        for s in strengths:
            story.append(Paragraph(f"• {s}", bullet_s))
        if soft_skills:
            story.append(Spacer(1, 4))
            story.append(Paragraph(f"<b>Soft Skills:</b> {', '.join(soft_skills)}", body_s))

    # ── Projects ──
    story.append(Paragraph("PROJECTS", section_s))
    story.append(divider())

    # Combine DB projects + interview-extracted projects
    interview_projects = summary.get("past_projects", []) or []
    all_projects = []

    # DB submissions with real data
    for proj in db_projects:
        tech = proj.get("tech_stack") or []
        # Find which program this project belongs to
        prog_name = ""
        if proj.get("student_program_id"):
            sp = next((p for p in programs if p["id"] == proj["student_program_id"]), None)
            if sp and sp.get("programs"):
                prog_name = sp["programs"]["name"]

        all_projects.append({
            "name": proj.get("title", "Project"),
            "tech": tech,
            "description": proj.get("description") or f"A project built as part of the {prog_name} program, demonstrating practical application of course concepts." if prog_name else "A hands-on development project showcasing practical software engineering skills.",
            "repo_url": proj.get("repo_url", ""),
            "demo_url": proj.get("demo_url", ""),
            "program": prog_name,
        })

    # Interview-extracted projects
    for proj in interview_projects:
        proj_name = proj.get("name", "")
        if not proj_name:
            continue
        already = any(p["name"].lower() == proj_name.lower() for p in all_projects)
        if not already:
            all_projects.append({
                "name": proj_name,
                "tech": proj.get("tech", []),
                "description": proj.get("description", ""),
                "repo_url": "",
                "demo_url": "",
                "program": "",
            })

    if all_projects:
        for proj in all_projects:
            tech_str = ", ".join(proj["tech"]) if proj.get("tech") else ""
            header = f"<b>{proj['name']}</b>"
            if proj.get("program"):
                header += f" <font size='9' color='#555'>| {proj['program']} Program</font>"
            story.append(Paragraph(header, bold_s))
            if tech_str:
                story.append(Paragraph(f"– Tech: {tech_str}", small_s))
            if proj.get("description"):
                story.append(Paragraph(f"– {proj['description']}", bullet_s))
            if proj.get("repo_url"):
                story.append(Paragraph(f"– GitHub: {proj['repo_url']}", small_s))
            if proj.get("demo_url"):
                story.append(Paragraph(f"– Live Demo: {proj['demo_url']}", small_s))
            story.append(Spacer(1, 5))
    else:
        # Fallback: show sample projects from the template
        fallback_projects = [
            {"name": "Aarohi Agriculture Platform", "tech": "Node.js, Express.js, MongoDB, Hugging Face APIs", "desc": "AI-driven agriculture platform with real-time weather forecasting and crop disease detection using Hugging Face ML models."},
            {"name": "NagrikVoice – Civic Issue Reporting System", "tech": "MERN Stack, Geolocation APIs", "desc": "Real-time map visualization with geolocation-based tagging and automated backend routing for municipal authorities."},
            {"name": "Akshay Smart Canteen", "tech": "HTML, CSS, JavaScript, Node.js, Firebase, MySQL, Razorpay", "desc": "Campus food ordering system with pre-ordering, priority-based order processing, and real-time order status. Deployed live at KLE Tech University."},
        ]
        for proj in fallback_projects:
            story.append(Paragraph(f"<b>{proj['name']}</b>", bold_s))
            story.append(Paragraph(f"– Tech: {proj['tech']}", small_s))
            story.append(Paragraph(f"– {proj['desc']}", bullet_s))
            story.append(Spacer(1, 5))

    # ── Extra-Curricular ──
    hobbies = summary.get("hobbies", "")
    story.append(Paragraph("EXTRA-CURRICULAR", section_s))
    story.append(divider())
    if hobbies:
        story.append(Paragraph(f"• {hobbies}", bullet_s))
    for item in FALLBACK_EXTRACURRICULAR:
        story.append(Paragraph(f"• {item}", bullet_s))

    doc.build(story)
    return output_path

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "studentId required"}))
        sys.exit(1)
    student_id = sys.argv[1]
    output_path = os.path.join(OUTPUT_DIR, f"{student_id}.pdf")
    try:
        build_resume(student_id, output_path)
        print(json.dumps({"success": True, "path": output_path}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)