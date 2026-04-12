#!/usr/bin/env python3
"""TMK Ingest - Part 3: Add YouTube entries to TM Krishna node.
Run after ingest_02_compositions.py and render.py."""
import subprocess, sys

DRY = "--dry-run" in sys.argv
TMK = "tm_krishna"

def wc(*args):
    cmd = ["python3", "carnatic/write_cli.py"] + list(args)
    if DRY:
        print("[DRY]", " ".join(str(a) for a in cmd))
        return
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(" ", (r.stdout + r.stderr).strip())

def yt(url, label, comp_id=None, raga_id=None, year=None):
    cmd = ["add-youtube", "--musician-id", TMK, "--url", url, "--label", label]
    if comp_id: cmd += ["--composition-id", comp_id]
    if raga_id: cmd += ["--raga-id", raga_id]
    if year:    cmd += ["--year", str(year)]
    wc(*cmd)

print("=== YOUTUBE ENTRIES FOR TM KRISHNA ===\n")

# ── Karnatic Modern Mumbai 2016 (uploaded 2017) ───────────────────────────
yt("https://www.youtube.com/watch?v=AEbAgJK30Z8",
   "Emaanadicchevo · Sahana · Adi - TM Krishna, Karnatic Modern Mumbai 2016",
   "emaanadicchevo", "sahana", 2016)

yt("https://www.youtube.com/watch?v=5yZEsJDJ9yc",
   "Manavinaalakincha Raadate · Nalinakanthi - TM Krishna, Karnatic Modern Mumbai 2016",
   "manavinaalakincha_raadate", "nalinakanthi", 2016)

# ── Essential TM Krishna Mumbai 2018 ─────────────────────────────────────
yt("https://www.youtube.com/watch?v=x1pbtvX89Bk",
   "Gajavadhana · Thodi - TM Krishna, Essential TM Krishna Mumbai 2018",
   "gajavadhana", "thodi", 2018)

# ── Essential TM Krishna Mumbai 2017 ─────────────────────────────────────
yt("https://www.youtube.com/watch?v=gPLyGjXcSkU",
   "Shri Viswanathan Bhajeham · Chaturdasa Ragamalika - TM Krishna, Essential TM Krishna Mumbai 2017",
   None, None, 2017)

# ── Karnatic Modern II Mumbai 2018 ───────────────────────────────────────
yt("https://www.youtube.com/watch?v=f_zYXorgEPQ",
   "Sogasu Chooda · Kannada Gowla - TM Krishna, Karnatic Modern II Mumbai 2018",
   "sogasu_chooda", "kannada_gowla", 2018)

yt("https://www.youtube.com/watch?v=GU--BVt4D0k",
   "Krishna Nee Begane · Yamuna Kalyani - TM Krishna, Karnatic Modern II Mumbai 2018",
   "krishna_nee_begane", "yamuna_kalyani", 2018)

yt("https://www.youtube.com/watch?v=iQTs7PSnX3k",
   "Baro Krishnayya · Maund - TM Krishna, Karnatic Modern II Mumbai 2018",
   "baro_krishnayya", "maund", 2018)

yt("https://www.youtube.com/watch?v=zQ1qhf1Lr9s",
   "Tiruvatriyur Thyagarajan · Atana - TM Krishna, Karnatic Modern II Mumbai 2018",
   "tiruvatriyur_thyagarajan", "atana", 2018)

yt("https://www.youtube.com/watch?v=BY7Vs90A0Ac",
   "Hecharikaga · Yadukulakhamboji - TM Krishna, Karnatic Modern II Mumbai 2018",
   "hecharikaga", "yadukulakhamboji", 2018)

yt("https://www.youtube.com/watch?v=sDXpDG43_r4",
   "O Jagadamba · Ananda Bhairavi - TM Krishna, Karnatic Modern II Mumbai 2018",
   "o_jagadamba", "ananda_bhairavi", 2018)

yt("https://www.youtube.com/watch?v=YFY7I2uyQSM",
   "Sri Venkata Girisa · Suruti - TM Krishna, Karnatic Modern II Mumbai 2018",
   "sri_venkata_girisa", "suruti", 2018)

yt("https://www.youtube.com/watch?v=tDaCYam087k",
   "Nenarunchara · Simhavahini - TM Krishna, Karnatic Modern II Mumbai 2018",
   "nenarunchara", "simhavahini", 2018)

yt("https://www.youtube.com/watch?v=Aa_9UMNlxBk",
   "Shri Guruna Palitosmi · Padi - TM Krishna, Karnatic Modern II Mumbai 2018",
   "shri_guruna_palitosmi", "padi", 2018)

yt("https://www.youtube.com/watch?v=VJkrZf-jtZw",
   "Nee Matumme · Kapi - TM Krishna, Karnatic Modern II Mumbai 2018",
   None, "kapi", 2018)

# ── Reshaping Art Mumbai 2018 ─────────────────────────────────────────────
yt("https://www.youtube.com/watch?v=XwaZkm1xIGs",
   "Sri Dakshinamurte · Shankarabharanam - TM Krishna, Reshaping Art Mumbai 2018",
   "sri_dakshinamurte", "shankarabharanam", 2018)

# ── Afghan Church Mumbai 2018 ─────────────────────────────────────────────
yt("https://www.youtube.com/watch?v=WknDE3b7Jjo",
   "Kamakshi · Varali - TM Krishna, Afghan Church Mumbai 2018",
   "kamakshi_varali", "varali", 2018)

yt("https://www.youtube.com/watch?v=fuH3lZo0JsA",
   "Nadopasana · Begada - TM Krishna & Vikku Vinayakram, Afghan Church Mumbai 2018",
   "nadopasana", "begada", 2018)

yt("https://www.youtube.com/watch?v=Fqzy22zwjeY",
   "Bare Panduranga · Maund - TM Krishna & Vikku Vinayakram, Afghan Church Mumbai 2018",
   "bare_panduranga", "maund", 2018)

yt("https://www.youtube.com/watch?v=Bs9FiFwxvSQ",
   "Jagadodharana · Kapi - TM Krishna & Vikku Vinayakram, Afghan Church Mumbai 2018",
   "jagadodharana", "kapi", 2018)

# ── Parallel Lines Pune 2018/2019 ─────────────────────────────────────────
yt("https://www.youtube.com/watch?v=5MAI223JEVc",
   "Jagadanandakaraka · Nattai - TM Krishna, Parallel Lines Pune 2018",
   "jagadanandakaraka", "nata", 2018)

yt("https://www.youtube.com/watch?v=T4cEp03lJcM",
   "Sri Ramachandra Kripalu · Yamuna Kalyani - TM Krishna, Parallel Lines Pune 2019",
   "sri_ramachandra_kripalu", "yamuna_kalyani", 2019)

# ── Crossroads Chennai 2019 ───────────────────────────────────────────────
yt("https://www.youtube.com/watch?v=tVYbfzmU7-Y",
   "O Jagadamba · Ananda Bhairavi - TM Krishna, Crossroads Chennai 2019",
   "o_jagadamba", "ananda_bhairavi", 2019)

yt("https://www.youtube.com/watch?v=YtUYjwImpDk",
   "Yarukkaghilum Bhayamaa · Begada - TM Krishna, Crossroads Chennai 2019",
   "yarukkaghilum_bhayamaa", "begada", 2019)

yt("https://www.youtube.com/watch?v=Avk6W-dX9Z0",
   "Sumasaayaka · Karnataka Kapi - TM Krishna, Crossroads Chennai 2019",
   "sumasaayaka", "karnataka_kapi", 2019)

yt("https://www.youtube.com/watch?v=WZ0seqi8Urw",
   "Baro Krishnayya · Maund - TM Krishna, Crossroads Chennai 2019",
   "baro_krishnayya", "maund", 2019)

yt("https://www.youtube.com/watch?v=ZjU3i6SYTP8",
   "Mohana Rama · Mohanam - TM Krishna, Crossroads Chennai 2019",
   "mohana_rama", "mohanam", 2019)

yt("https://www.youtube.com/watch?v=9mMA9-t9lm4",
   "Eppo Varuvaaro · Jonepuri - TM Krishna, Crossroads Chennai 2019",
   "eppo_varuvaaro", "jonepuri", 2019)

# ── Crossroads Mumbai 2019 ────────────────────────────────────────────────
yt("https://www.youtube.com/watch?v=nnLAgrFF-m4",
   "Meru Samaana · Mayamalavagowla - TM Krishna, Crossroads Mumbai 2019",
   "meru_samaana", "mayamalavagowla", 2019)

yt("https://www.youtube.com/watch?v=yvtlxGJyIz8",
   "Yee Vasudha · Kanada - TM Krishna, Crossroads Mumbai 2019",
   "yee_vasudha", "kaanada", 2019)

yt("https://www.youtube.com/watch?v=rXwvTLOuVAU",
   "Kshitija Ramanam · Devagandhari - TM Krishna, Crossroads Mumbai 2019",
   "kshitija_ramanam", "devagandhari", 2019)

# ── Kolkata 2019 ──────────────────────────────────────────────────────────
yt("https://www.youtube.com/watch?v=ovgWK5aQcpM",
   "Amba Nilayatakshi · Neelambari - TM Krishna, Kolkata 2019",
   "amba_nilayatakshi", "neelambari", 2019)

yt("https://www.youtube.com/watch?v=Gkzru79jeT4",
   "Laavanya Rama Kannul Ara · Poorna Shadjam - TM Krishna, Kolkata 2019",
   "laavanya_rama_kannul_ara", "poornashadjam", 2019)

yt("https://www.youtube.com/watch?v=3ZFVV64Or5g",
   "Kanaka Shaila Viharini · Punnagavarali - TM Krishna, Kolkata 2019",
   "kanaka_shaila_viharini", "punnagavarali", 2019)

yt("https://www.youtube.com/watch?v=7A0YSVf-z3c",
   "Brocevarevarura · Khamas - TM Krishna, Kolkata 2019",
   "brocevarevarura", "khamas", 2019)

yt("https://www.youtube.com/watch?v=v1g16qHvc74",
   "Jambu Pathe Mam Pahi · Yamuna Kalyani - TM Krishna, Kolkata 2019",
   "jambu_pathe_mam_pahi", "yamuna_kalyani", 2019)

yt("https://www.youtube.com/watch?v=2-Hu2GXk6k8",
   "Saramaina Matalento · Behag - TM Krishna, Kolkata 2019",
   "saramaina_matalento", "behag", 2019)

yt("https://www.youtube.com/watch?v=KYXuPI4wDHM",
   "Ni Mattume · Kapi - TM Krishna, Kolkata 2019",
   None, "kapi", 2019)

# ── Concert for Peace Mumbai 2019 ─────────────────────────────────────────
yt("https://www.youtube.com/watch?v=NocL9bp4vIY",
   "Teliyaleru Rama · Dhenuka - TM Krishna, Concert for Peace Mumbai 2019",
   "teliyaleru_rama", "dhenuka", 2019)

# ── Aikya Mumbai 2020 ─────────────────────────────────────────────────────
yt("https://www.youtube.com/watch?v=NRc9yvEex2Q",
   "Endaro Mahanubhavulu · Sri - TM Krishna, Aikya Mumbai 2020",
   "endaro_mahanubhavulu", "sriraga", 2020)

yt("https://www.youtube.com/watch?v=8upNeiMEdVc",
   "Sri Matrubhutam · Kannada - TM Krishna, Aikya Mumbai 2020",
   "sri_matrubhutam", "kannada", 2020)

yt("https://www.youtube.com/watch?v=F2TXcr1wAd4",
   "Chakkani Raja Margamu · Kharaharapriya - TM Krishna, Aikya Mumbai 2020",
   "chakkani_raja_margamu", "kharaharapriya", 2020)

yt("https://www.youtube.com/watch?v=1Dp88V6m8Tw",
   "Jagadodharana · Kapi - TM Krishna, Aikya Mumbai 2020",
   "jagadodharana", "kapi", 2020)

# ── Parallel Lines Bangalore 2020 ────────────────────────────────────────
yt("https://www.youtube.com/watch?v=NfaWuqmljKM",
   "Muripemu Kalige · Mukhari - TM Krishna, Parallel Lines Bangalore 2020",
   "muripemu_kalige", "mukhari", 2020)

yt("https://www.youtube.com/watch?v=Es04SHxFae4",
   "Bhajare Re Chitta Balambikam · Kalyani - TM Krishna, Parallel Lines Bangalore 2020",
   "bhajare_re_chitta_balambikam", "kalyani", 2020)

# ── Take 5 Mumbai 2023 ────────────────────────────────────────────────────
yt("https://www.youtube.com/watch?v=P9uJczd9vio",
   "Siva Siva Siva Ena Radha · Pantuvarali - TM Krishna & Vikku Vinayakram, Take 5 Mumbai 2023",
   "siva_siva_siva_ena_radha", "pantuvarali", 2023)

yt("https://www.youtube.com/watch?v=36woEZ2KHcQ",
   "Kamakshi · Bhairavi - TM Krishna & Vikku Vinayakram, Take 5 Mumbai 2023",
   "kamakshi_varali", "bhairavi", 2023)

# ── Kerala Literature Festival 2025 ──────────────────────────────────────
yt("https://www.youtube.com/watch?v=u2hoAfGGe6g",
   "Guruleka Etuvanti · Gowrimanohari - TM Krishna & Vikku Vinayakram, Kerala Lit Fest 2025",
   "guruleka_etuvanti", "gowrimanohari", 2025)

yt("https://www.youtube.com/watch?v=4MuQCjsy3_M",
   "Sarojadala Netri · Shankarabharanam - TM Krishna & Vikku Vinayakram, Kerala Lit Fest 2025",
   "sarojadala_netri", "shankarabharanam", 2025)

yt("https://www.youtube.com/watch?v=sOVYyQL2Df0",
   "Muddugare Yashoda · Kurinji - TM Krishna & Vikku Vinayakram, Kerala Lit Fest 2025",
   "muddugare_yashoda", "kurinji", 2025)

yt("https://www.youtube.com/watch?v=1ZBOsnXOkYU",
   "Maithrim Bhajata · Yamuna Kalyani - TM Krishna & Vikku Vinayakram, Kerala Lit Fest 2025",
   "maithrim_bhajata", "yamuna_kalyani", 2025)

yt("https://www.youtube.com/watch?v=B86oyObRYIY",
   "Sri Ramachandra Kripalu · Yaman Kalyan - TM Krishna & Vikku Vinayakram, Kerala Lit Fest 2025",
   "sri_ramachandra_kripalu", "yaman_kalyan", 2025)

print("\n=== FINAL RENDER + VALIDATE ===")
r = subprocess.run(["python3", "carnatic/render.py"], capture_output=True, text=True)
print(" ", (r.stdout + r.stderr).strip())
r = subprocess.run(["python3", "carnatic/cli.py", "validate"], capture_output=True, text=True)
print(" ", (r.stdout + r.stderr).strip())
print("\nIngest complete.")
