#!/usr/bin/env python3
"""
TMK Playlist Ingest Script - Part A: Ragas, Composers, Compositions
Run FIRST: python3 carnatic/ingest_tmk_playlist.py [--dry-run]
Then run:  python3 carnatic/ingest_tmk_youtube.py [--dry-run]
"""
import subprocess, sys

DRY_RUN = "--dry-run" in sys.argv

def run(cmd):
    if DRY_RUN:
        print(f"[DRY-RUN] {' '.join(str(c) for c in cmd)}")
        return True
    r = subprocess.run(cmd, capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip()
    if out:
        print(f"  {out}")
    return True

def wc(*args):
    run(["python3", "carnatic/write_cli.py"] + list(args))

def render():
    run(["python3", "carnatic/render.py"])

# ── STEP 1: RAGAS ────────────────────────────────────────────────────────────
print("\n=== STEP 1: ADD RAGAS ===\n")

RAGAS = [
    # (id, name, aliases, melakarta, wiki, notes)
    ("atana", "Atana", "Adana", None,
     "https://en.wikipedia.org/wiki/Atana",
     "Janya of Kharaharapriya (22nd melakarta). Bold, heroic character. Frequently used for Tyagaraja kritis."),
    ("dhenuka", "Dhenuka", None, None,
     "https://en.wikipedia.org/wiki/Dhenuka_(raga)",
     "Janya of Kharaharapriya (22nd melakarta). Pentatonic, gentle devotional character."),
    ("gowrimanohari", "Gowrimanohari", "Gauri Manohari", 23,
     "https://en.wikipedia.org/wiki/Gowrimanohari",
     "23rd melakarta (Kanakangi group). Sampurna raga, serene majestic character."),
    ("hamir_kalyani", "Hamir Kalyani", "Hameer Kalyani", None,
     "https://en.wikipedia.org/wiki/Hamir_Kalyani",
     "Janya of Kalyani (65th melakarta). Corresponds to Hindustani Hamir. Bright, expansive."),
    ("jonepuri", "Jonepuri", "Janapuri,Jaunpuri", None,
     "https://en.wikipedia.org/wiki/Jonpuri",
     "Janya of Natabhairavi (20th melakarta). Corresponds to Hindustani Jaunpuri. Melancholic, contemplative."),
    ("kannada", "Kannada", "Kaanada", None,
     "https://en.wikipedia.org/wiki/Kannada_(raga)",
     "Janya of Kharaharapriya (22nd melakarta). Vakra raga, majestic dignified character. Used in Dikshitar kritis."),
    ("kannada_gowla", "Kannada Gowla", None, None,
     "https://en.wikipedia.org/wiki/Kannada_Gowla",
     "Janya of Mayamalavagowla (15th melakarta). Rare raga. Tyagaraja composed Sogasu Chooda in this raga."),
    ("karnataka_kapi", "Karnataka Kapi", None, None,
     "https://en.wikipedia.org/wiki/Karnataka_Kapi",
     "Janya raga distinct from Kapi. Used in padams and varnams. Swati Tirunal's Sumasaayaka is a well-known composition."),
    ("kurinji", "Kurinji", "Kurinjii", None,
     "https://en.wikipedia.org/wiki/Kurinji_(raga)",
     "Janya of Kharaharapriya (22nd melakarta). Pentatonic, sweet romantic character."),
    ("maund", "Maund", "Mand", None,
     "https://en.wikipedia.org/wiki/Mand_(raga)",
     "Janya of Kharaharapriya (22nd melakarta). Corresponds to Hindustani Mand. Gentle folk-like character, popular for bhajans."),
    ("nalinakanthi", "Nalinakanthi", "Nalinakanti", None,
     "https://en.wikipedia.org/wiki/Nalinakanthi",
     "Janya of Shankarabharanam (29th melakarta). Pentatonic, bright cheerful character."),
    ("neelambari", "Neelambari", "Nilambari", None,
     "https://en.wikipedia.org/wiki/Neelambari",
     "Janya of Shankarabharanam (29th melakarta). Associated with lullabies and the divine. Dikshitar composed several kritis here."),
    ("padi", "Padi", None, None,
     "https://en.wikipedia.org/wiki/Padi_(raga)",
     "Janya of Mayamalavagowla (15th melakarta). Rare raga used by Dikshitar. Shri Guruna Palitosmi is a well-known kriti."),
    ("purvi", "Purvi", "Poorvi", None,
     "https://en.wikipedia.org/wiki/Purvi_(raga)",
     "Corresponds to Hindustani Purvi. Serious evening raga, contemplative character. Used by Dikshitar."),
    ("ravi_chandrika", "Ravi Chandrika", "Ravichandrika", None,
     "https://en.wikipedia.org/wiki/Ravi_Chandrika",
     "Janya of Shankarabharanam (29th melakarta). Rare raga used by Tyagaraja."),
    ("simhavahini", "Simhavahini", "Simhavahana", None,
     "https://en.wikipedia.org/wiki/Simhavahini",
     "Janya of Shankarabharanam (29th melakarta). Rare raga. Tyagaraja's Nenarunchara is a well-known kriti."),
    ("suruti", "Suruti", "Surutti", None,
     "https://en.wikipedia.org/wiki/Surutti",
     "Janya of Kharaharapriya (22nd melakarta). Vakra raga, rich emotive character. Dikshitar's Sri Venkata Girisa is in this raga."),
    ("thodi", "Thodi", "Todi,Shubhapantuvarali", 8,
     "https://en.wikipedia.org/wiki/Todi_(Carnatic_raga)",
     "8th melakarta (Todi group). One of the most important ragas in Carnatic music. Deep emotive character, parent of many janya ragas."),
    ("yadukulakhamboji", "Yadukulakhamboji", "Yadukula Kambhoji", None,
     "https://en.wikipedia.org/wiki/Yadukulakambhoji",
     "Janya of Harikambhoji (28th melakarta). Pentatonic, bright devotional character. Tyagaraja's Hecharikaga is a well-known kriti."),
    ("yaman_kalyan", "Yaman Kalyan", "Yaman", None,
     "https://en.wikipedia.org/wiki/Yaman_Kalyan",
     "Corresponds to Hindustani Yaman Kalyan. Related to Carnatic Kalyani. Used for bhajans and devotional music."),
    ("yamuna_kalyani", "Yamuna Kalyani", "Yamunakalyani", None,
     "https://en.wikipedia.org/wiki/Yamuna_Kalyani",
     "Janya of Kalyani (65th melakarta). Pentatonic, bright devotional character. Dikshitar's Jambu Pathe Mam Pahi is in this raga."),
]

for rid, name, aliases, mel, wiki, notes in RAGAS:
    cmd = ["add-raga", "--id", rid, "--name", name,
           "--source-url", wiki, "--source-label", "Wikipedia",
           "--source-type", "wikipedia", "--notes", notes]
    if aliases:
        cmd += ["--aliases", aliases]
    if mel is not None:
        cmd += ["--melakarta", str(mel)]
    wc(*cmd)

# ── STEP 2: COMPOSERS ────────────────────────────────────────────────────────
print("\n=== STEP 2: ADD COMPOSERS ===\n")

COMPOSERS = [
    # (id, name, born, died, wiki)
    ("annamacharya", "Annamacharya", 1408, 1503,
     "https://en.wikipedia.org/wiki/Annamacharya"),
    ("basava", "Basava", 1131, 1167,
     "https://en.wikipedia.org/wiki/Basava"),
    ("chandrasekharendra_saraswati", "Chandrasekharendra Saraswati", 1894, 1994,
     "https://en.wikipedia.org/wiki/Chandrasekharendra_Saraswati"),
    ("dv_gundappa", "DV Gundappa", 1887, 1975,
     "https://en.wikipedia.org/wiki/D._V._Gundappa"),
    ("ghanam_krishna_iyer", "Ghanam Krishna Iyer", 1781, 1856,
     "https://en.wikipedia.org/wiki/Ghanam_Krishna_Iyer"),
    ("gopalakrishna_bharathi", "Gopalakrishna Bharathi", 1811, 1896,
     "https://en.wikipedia.org/wiki/Gopalakrishna_Bharathi"),
    ("kanaka_dasa", "Kanaka Dasa", 1509, 1609,
     "https://en.wikipedia.org/wiki/Kanaka_Dasa"),
    ("kumara_ettendra", "Kumara Ettendra", None, None,
     "https://en.wikipedia.org/wiki/Kumara_Ettendra"),
    ("muthiah_bhagavathar", "Muthiah Bhagavathar", 1877, 1945,
     "https://en.wikipedia.org/wiki/Harikesanallur_Muthiah_Bhagavathar"),
    ("mysore_vasudevacharya", "Mysore Vasudevacharya", 1865, 1961,
     "https://en.wikipedia.org/wiki/Mysore_Vasudevacharya"),
    ("perumal_murugan", "Perumal Murugan", 1966, None,
     "https://en.wikipedia.org/wiki/Perumal_Murugan"),
    ("purandara_dasa", "Purandara Dasa", 1484, 1564,
     "https://en.wikipedia.org/wiki/Purandaradasa"),
    ("rabindranath_tagore", "Rabindranath Tagore", 1861, 1941,
     "https://en.wikipedia.org/wiki/Rabindranath_Tagore"),
    ("subbarama_iyer", "Subbarama Iyer", None, None,
     "https://en.wikipedia.org/wiki/Subbarama_Iyer"),
    ("tukaram", "Tukaram", 1598, 1650,
     "https://en.wikipedia.org/wiki/Tukaram"),
    ("tulsidas", "Tulsidas", 1532, 1623,
     "https://en.wikipedia.org/wiki/Tulsidas"),
    ("vyasatirtha", "Vyasatirtha", 1460, 1539,
     "https://en.wikipedia.org/wiki/Vyasatirtha"),
]

for cid, name, born, died, wiki in COMPOSERS:
    cmd = ["add-composer", "--id", cid, "--name", name,
           "--source-url", wiki, "--source-label", "Wikipedia",
           "--source-type", "wikipedia"]
    if born is not None:
        cmd += ["--born", str(born)]
    if died is not None:
        cmd += ["--died", str(died)]
    wc(*cmd)

# ── STEP 3: RENDER ───────────────────────────────────────────────────────────
print("\n=== STEP 3: RENDER (after ragas + composers) ===\n")
render()

# ── STEP 4: COMPOSITIONS ─────────────────────────────────────────────────────
print("\n=== STEP 4: ADD COMPOSITIONS ===\n")

# Raga name -> graph id
R = {
    "Ananda Bhairavi": "ananda_bhairavi", "Atana": "atana",
    "Begada": "begada", "Behag": "behag", "Bhairavi": "bhairavi",
    "Devagandhari": "devagandhari", "Dhenuka": "dhenuka",
    "Gowrimanohari": "gowrimanohari", "Hamir Kalyani": "hamir_kalyani",
    "Hamsadhwani": "hamsadhwani", "Jonepuri": "jonepuri",
    "Kalyani": "kalyani", "Kanada": "kaanada", "Kannada": "kannada",
    "Kannada Gowla": "kannada_gowla", "Kapi": "kapi",
    "Karnataka Kapi": "karnataka_kapi", "Khamas": "khamas",
    "Kharaharapriya": "kharaharapriya", "Kurinji": "kurinji",
    "Maund": "maund", "Mayamalavagowla": "mayamalavagowla",
    "Mohanam": "mohanam", "Mukhari": "mukhari",
    "Nalinakanthi": "nalinakanthi", "Nattai": "nata",
    "Neelambari": "neelambari", "Padi": "padi",
    "Pantuvarali": "pantuvarali", "Poorna Shadjam": "poornashadjam",
    "Punnagavarali": "punnagavarali", "Purvi": "purvi",
    "Ravi Chandrika": "ravi_chandrika", "Sahana": "sahana",
    "Shankarabharanam": "shankarabharanam", "Simhavahini": "simhavahini",
    "Sri": "sriraga", "Suruti": "suruti", "Thodi": "thodi",
    "Varali": "varali", "Yadukulakhamboji": "yadukulakhamboji",
    "Yaman Kalyan": "yaman_kalyan", "Yamuna Kalyani": "yamuna_kalyani",
}

# Composer name -> graph id
C = {
    "Annamacharya": "annamacharya", "Basava": "basava",
    "Chandrasekharendra Saraswati": "chandrasekharendra_saraswati",
    "DV Gundappa": "dv_gundappa",
    "Ghanam Krishna Iyer": "ghanam_krishna_iyer",
    "Gopalakrishna Bharathi": "gopalakrishna_bharathi",
    "Kanaka Dasa": "kanaka_dasa", "Kshetrayya": "kshetrayya",
    "Kumara Ettendra": "kumara_ettendra",
    "Muthiah Bhagavathar": "muthiah_bhagavathar",
    "Muthuswami Dikshitar": "muthuswami_dikshitar",
    "Mysore Vasudevacharya": "mysore_vasudevacharya",
    "Patnam Subramanya Iyer": "patnam_subramanya_iyer",
    "Perumal Murugan": "perumal_murugan",
    "Purandara Dasa": "purandara_dasa",
    "Rabindranath Tagore": "rabindranath_tagore",
    "Shyama Shastri": "shyama_shastri",
    "Subbarama Iyer": "subbarama_iyer",
    "Swati Tirunal": "swati_tirunal",
    "Tukaram": "tukaram", "Tulsidas": "tulsidas",
    "Tyagaraja": "tyagaraja", "Vyasatirtha": "vyasatirtha",
}

# (id, title, composer, raga, tala, lang, wiki, notes)
COMPS = [
    # Tyagaraja
    ("emaanadicchevo", "Emaanadicchevo",
     "Tyagaraja", "Sahana", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Emaanadicchevo",
     "Tyagaraja kriti in Sahana raga."),
    ("manavinaalakincha_raadate", "Manavinaalakincha Raadate",
     "Tyagaraja", "Nalinakanthi", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Manavinaalakincha_Raadate",
     "Tyagaraja kriti in Nalinakanthi raga."),
    ("sogasu_chooda", "Sogasu Chooda",
     "Tyagaraja", "Kannada Gowla", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Sogasugaa_Mridanga_Taalamu",
     "Tyagaraja kriti in Kannada Gowla raga."),
    ("hecharikaga", "Hecharikaga",
     "Tyagaraja", "Yadukulakhamboji", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Hecharikaga",
     "Tyagaraja kriti in Yadukulakhamboji raga."),
    ("nadopasana", "Nadopasana",
     "Tyagaraja", "Begada", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Nadopasana",
     "Tyagaraja kriti in Begada raga. Devotional composition on the worship of music."),
    ("jagadanandakaraka", "Jagadanandakaraka",
     "Tyagaraja", "Nattai", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Jagadanandakaraka",
     "First of Tyagaraja's Pancharatna Kritis. Nattai raga, Adi tala."),
    ("endaro_mahanubhavulu", "Endaro Mahanubhavulu",
     "Tyagaraja", "Sri", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Endaro_Mahanubhavulu",
     "Fifth of Tyagaraja's Pancharatna Kritis. Sri raga, Adi tala. Tribute to great souls."),
    ("chakkani_raja_margamu", "Chakkani Raja Margamu",
     "Tyagaraja", "Kharaharapriya", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Chakkani_Raja_Margamu",
     "Tyagaraja kriti in Kharaharapriya raga."),
    ("mohana_rama", "Mohana Rama",
     "Tyagaraja", "Mohanam", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Mohana_Rama",
     "Tyagaraja kriti in Mohanam raga."),
    ("meru_samaana", "Meru Samaana",
     "Tyagaraja", "Mayamalavagowla", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Meru_Samaana",
     "Tyagaraja kriti in Mayamalavagowla raga."),
    ("yee_vasudha", "Yee Vasudha",
     "Tyagaraja", "Kanada", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Yee_Vasudha",
     "Tyagaraja kriti in Kanada raga."),
    ("muripemu_kalige", "Muripemu Kalige",
     "Tyagaraja", "Mukhari", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Muripemu_Kalige",
     "Tyagaraja kriti in Mukhari raga."),
    ("nenarunchara", "Nenarunchara",
     "Tyagaraja", "Simhavahini", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Nenarunchara",
     "Tyagaraja kriti in Simhavahini raga. Rare raga composition."),
    ("siva_siva_siva_ena_radha", "Siva Siva Siva Ena Radha",
     "Tyagaraja", "Pantuvarali", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Siva_Siva_Siva_Ena_Radha",
     "Tyagaraja kriti in Pantuvarali raga. Devotional composition on Shiva."),
    ("guruleka_etuvanti", "Guruleka Etuvanti",
     "Tyagaraja", "Gowrimanohari", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Guruleka_Etuvanti",
     "Tyagaraja kriti in Gowrimanohari raga. On the importance of a guru."),
    ("laavanya_rama_kannul_ara", "Laavanya Rama Kannul Ara",
     "Tyagaraja", "Poorna Shadjam", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Laavanya_Rama_Kannul_Ara",
     "Tyagaraja kriti in Poorna Shadjam raga."),
    ("teliyaleru_rama", "Teliyaleru Rama",
     "Tyagaraja", "Dhenuka", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Teliyaleru_Rama",
     "Tyagaraja kriti in Dhenuka raga."),
    # Muthuswami Dikshitar
    ("sri_venkata_girisa", "Sri Venkata Girisa",
     "Muthuswami Dikshitar", "Suruti", "Adi", "Sanskrit",
     "https://en.wikipedia.org/wiki/Sri_Venkata_Girisa",
     "Muthuswami Dikshitar kriti in Suruti raga."),
    ("shri_guruna_palitosmi", "Shri Guruna Palitosmi",
     "Muthuswami Dikshitar", "Padi", "Adi", "Sanskrit",
     "https://en.wikipedia.org/wiki/Shri_Guruna_Palitosmi",
     "Muthuswami Dikshitar kriti in Padi raga. Rare raga composition."),
    ("sri_dakshinamurte", "Sri Dakshinamurte",
     "Muthuswami Dikshitar", "Shankarabharanam", "Adi", "Sanskrit",
     "https://en.wikipedia.org/wiki/Sri_Dakshinamurte",
     "Muthuswami Dikshitar kriti in Shankarabharanam raga."),
    ("amba_nilayatakshi", "Amba Nilayatakshi Karunakatakshi",
     "Muthuswami Dikshitar", "Neelambari", "Adi", "Sanskrit",
     "https://en.wikipedia.org/wiki/Amba_Nilayatakshi",
     "Muthuswami Dikshitar kriti in Neelambari raga. Part of the Kamalamba Navavarana Kritis."),
    ("kshitija_ramanam", "Kshitija Ramanam",
     "Muthuswami Dikshitar", "Devagandhari", "Adi", "Sanskrit",
     "https://en.wikipedia.org/wiki/Kshitija_Ramanam",
     "Muthuswami Dikshitar kriti in Devagandhari raga."),
    ("jambu_pathe_mam_pahi", "Jambu Pathe Mam Pahi",
     "Muthuswami Dikshitar", "Yamuna Kalyani", "Adi", "Sanskrit",
     "https://en.wikipedia.org/wiki/Jambu_Pathe_Mam_Pahi",
     "Muthuswami Dikshitar kriti in Yamuna Kalyani raga. Pancha Bhuta Stalas series (water element)."),
    ("bhajare_re_chitta_balambikam", "Bhajare Re Chitta Balambikam",
     "Muthuswami Dikshitar", "Kalyani", "Adi", "Sanskrit",
     "https://en.wikipedia.org/wiki/Bhajare_Re_Chitta_Balambikam",
     "Muthuswami Dikshitar kriti in Kalyani raga."),
    ("sri_matrubhutam", "Sri Matrubhutam",
     "Muthuswami Dikshitar", "Kannada", "Adi", "Sanskrit",
     "https://en.wikipedia.org/wiki/Sri_Matrubhutam",
     "Muthuswami Dikshitar kriti in Kannada raga."),
    # Shyama Shastri
    ("o_jagadamba", "O Jagadamba",
     "Shyama Shastri", "Ananda Bhairavi", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/O_Jagadamba",
     "Shyama Shastri kriti in Ananda Bhairavi raga. One of the Trinity's most celebrated compositions."),
    ("kamakshi_varali", "Kamakshi",
     "Shyama Shastri", "Varali", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Kamakshi_(Shyama_Shastri)",
     "Shyama Shastri kriti in Varali raga. A popular concert piece."),
    ("kanaka_shaila_viharini", "Kanaka Shaila Viharini",
     "Shyama Shastri", "Punnagavarali", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Kanaka_Shaila_Viharini",
     "Shyama Shastri kriti in Punnagavarali raga."),
    ("sarojadala_netri", "Sarojadala Netri",
     "Shyama Shastri", "Shankarabharanam", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Sarojadala_Netri",
     "Shyama Shastri kriti in Shankarabharanam raga."),
    # Swati Tirunal
    ("sumasaayaka", "Sumasaayaka",
     "Swati Tirunal", "Karnataka Kapi", "Adi", "Sanskrit",
     "https://en.wikipedia.org/wiki/Sumasaayaka",
     "Swati Tirunal varnam in Karnataka Kapi raga."),
    ("saramaina_matalento", "Saramaina Matalento",
     "Swati Tirunal", "Behag", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Saramaina_Matalento",
     "Swati Tirunal kriti in Behag raga."),
    # Purandara Dasa
    ("jagadodharana", "Jagadodharana",
     "Purandara Dasa", "Kapi", "Adi", "Kannada",
     "https://en.wikipedia.org/wiki/Jagadodharana",
     "Purandara Dasa composition in Kapi raga. A popular devotional song on Krishna."),
    # Kanaka Dasa
    ("baro_krishnayya", "Baro Krishnayya",
     "Kanaka Dasa", "Maund", "Adi", "Kannada",
     "https://en.wikipedia.org/wiki/Baro_Krishnayya",
     "Kanaka Dasa composition in Maund raga. A popular devotional song on Krishna."),
    # Vyasatirtha
    ("krishna_nee_begane", "Krishna Nee Begane",
     "Vyasatirtha", "Yamuna Kalyani", "Adi", "Kannada",
     "https://en.wikipedia.org/wiki/Krishna_Nee_Begane_Baro",
     "Vyasatirtha composition in Yamuna Kalyani raga. One of the most popular Carnatic devotional songs."),
    # Tukaram
    ("bare_panduranga", "Bare Panduranga",
     "Tukaram", "Maund", "Adi", "Marathi",
     "https://en.wikipedia.org/wiki/Tukaram",
     "Tukaram abhang in Maund raga. A popular Varkari devotional composition."),
    # Ghanam Krishna Iyer
    ("tiruvatriyur_thyagarajan", "Tiruvatriyur Thyagarajan",
     "Ghanam Krishna Iyer", "Atana", "Adi", "Tamil",
     "https://en.wikipedia.org/wiki/Ghanam_Krishna_Iyer",
     "Ghanam Krishna Iyer composition in Atana raga."),
    # Mysore Vasudevacharya
    ("brocevarevarura", "Brocevarevarura Ninnu Vina Raghuvara",
     "Mysore Vasudevacharya", "Khamas", "Adi", "Telugu",
     "https://en.wikipedia.org/wiki/Brocevarevarura",
     "Mysore Vasudevacharya kriti in Khamas raga. A popular concert piece."),
    # Gopalakrishna