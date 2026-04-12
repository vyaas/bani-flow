#!/usr/bin/env python3
"""TMK Ingest - Part 2: Add missing compositions. Run after ingest_01."""
import subprocess, sys

DRY = "--dry-run" in sys.argv

def wc(*args):
    cmd = ["python3", "carnatic/write_cli.py"] + list(args)
    if DRY:
        print("[DRY]", " ".join(str(a) for a in cmd))
        return
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(" ", (r.stdout + r.stderr).strip())

def render():
    cmd = ["python3", "carnatic/render.py"]
    if DRY:
        print("[DRY] render.py"); return
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(" ", (r.stdout + r.stderr).strip())

# Raga name -> graph id
R = {
    "Ananda Bhairavi":"ananda_bhairavi","Atana":"atana","Begada":"begada",
    "Behag":"behag","Bhairavi":"bhairavi","Devagandhari":"devagandhari",
    "Dhenuka":"dhenuka","Gowrimanohari":"gowrimanohari",
    "Hamir Kalyani":"hamir_kalyani","Hamsadhwani":"hamsadhwani",
    "Jonepuri":"jonepuri","Kalyani":"kalyani","Kanada":"kaanada",
    "Kannada":"kannada","Kannada Gowla":"kannada_gowla","Kapi":"kapi",
    "Karnataka Kapi":"karnataka_kapi","Khamas":"khamas",
    "Kharaharapriya":"kharaharapriya","Kurinji":"kurinji","Maund":"maund",
    "Mayamalavagowla":"mayamalavagowla","Mohanam":"mohanam","Mukhari":"mukhari",
    "Nalinakanthi":"nalinakanthi","Nattai":"nata","Neelambari":"neelambari",
    "Padi":"padi","Pantuvarali":"pantuvarali","Poorna Shadjam":"poornashadjam",
    "Punnagavarali":"punnagavarali","Purvi":"purvi",
    "Ravi Chandrika":"ravi_chandrika","Sahana":"sahana",
    "Shankarabharanam":"shankarabharanam","Simhavahini":"simhavahini",
    "Sri":"sriraga","Suruti":"suruti","Thodi":"thodi","Varali":"varali",
    "Yadukulakhamboji":"yadukulakhamboji","Yaman Kalyan":"yaman_kalyan",
    "Yamuna Kalyani":"yamuna_kalyani",
}

# Composer name -> graph id
C = {
    "Annamacharya":"annamacharya","Basava":"basava",
    "Chandrasekharendra Saraswati":"chandrasekharendra_saraswati",
    "DV Gundappa":"dv_gundappa","Ghanam Krishna Iyer":"ghanam_krishna_iyer",
    "Gopalakrishna Bharathi":"gopalakrishna_bharathi",
    "Kanaka Dasa":"kanaka_dasa","Kshetrayya":"kshetrayya",
    "Kumara Ettendra":"kumara_ettendra",
    "Muthiah Bhagavathar":"muthiah_bhagavathar",
    "Muthuswami Dikshitar":"muthuswami_dikshitar",
    "Mysore Vasudevacharya":"mysore_vasudevacharya",
    "Patnam Subramanya Iyer":"patnam_subramanya_iyer",
    "Perumal Murugan":"perumal_murugan","Purandara Dasa":"purandara_dasa",
    "Rabindranath Tagore":"rabindranath_tagore",
    "Shyama Shastri":"shyama_shastri","Subbarama Iyer":"subbarama_iyer",
    "Swati Tirunal":"swati_tirunal","Tukaram":"tukaram","Tulsidas":"tulsidas",
    "Tyagaraja":"tyagaraja","Vyasatirtha":"vyasatirtha",
}

print("=== COMPOSITIONS ===")

# (id, title, composer, raga, tala, lang, wiki, notes)
COMPS = [
    # ── Tyagaraja ──────────────────────────────────────────────────────────
    ("emaanadicchevo","Emaanadicchevo",
     "Tyagaraja","Sahana","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Emaanadicchevo",
     "Tyagaraja kriti in Sahana raga."),
    ("manavinaalakincha_raadate","Manavinaalakincha Raadate",
     "Tyagaraja","Nalinakanthi","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Manavinaalakincha_Raadate",
     "Tyagaraja kriti in Nalinakanthi raga."),
    ("sogasu_chooda","Sogasu Chooda",
     "Tyagaraja","Kannada Gowla","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Sogasugaa_Mridanga_Taalamu",
     "Tyagaraja kriti in Kannada Gowla raga."),
    ("hecharikaga","Hecharikaga",
     "Tyagaraja","Yadukulakhamboji","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Hecharikaga",
     "Tyagaraja kriti in Yadukulakhamboji raga."),
    ("nadopasana","Nadopasana",
     "Tyagaraja","Begada","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Nadopasana",
     "Tyagaraja kriti in Begada raga. Devotional composition on the worship of music."),
    ("jagadanandakaraka","Jagadanandakaraka",
     "Tyagaraja","Nattai","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Jagadanandakaraka",
     "First of Tyagaraja's Pancharatna Kritis. Nattai raga, Adi tala."),
    ("endaro_mahanubhavulu","Endaro Mahanubhavulu",
     "Tyagaraja","Sri","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Endaro_Mahanubhavulu",
     "Fifth of Tyagaraja's Pancharatna Kritis. Sri raga, Adi tala. Tribute to great souls."),
    ("chakkani_raja_margamu","Chakkani Raja Margamu",
     "Tyagaraja","Kharaharapriya","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Chakkani_Raja_Margamu",
     "Tyagaraja kriti in Kharaharapriya raga."),
    ("mohana_rama","Mohana Rama",
     "Tyagaraja","Mohanam","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Mohana_Rama",
     "Tyagaraja kriti in Mohanam raga."),
    ("meru_samaana","Meru Samaana",
     "Tyagaraja","Mayamalavagowla","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Meru_Samaana",
     "Tyagaraja kriti in Mayamalavagowla raga."),
    ("yee_vasudha","Yee Vasudha",
     "Tyagaraja","Kanada","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Yee_Vasudha",
     "Tyagaraja kriti in Kanada raga."),
    ("muripemu_kalige","Muripemu Kalige",
     "Tyagaraja","Mukhari","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Muripemu_Kalige",
     "Tyagaraja kriti in Mukhari raga."),
    ("nenarunchara","Nenarunchara",
     "Tyagaraja","Simhavahini","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Nenarunchara",
     "Tyagaraja kriti in Simhavahini raga. Rare raga composition."),
    ("siva_siva_siva_ena_radha","Siva Siva Siva Ena Radha",
     "Tyagaraja","Pantuvarali","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Siva_Siva_Siva_Ena_Radha",
     "Tyagaraja kriti in Pantuvarali raga. Devotional composition on Shiva."),
    ("guruleka_etuvanti","Guruleka Etuvanti",
     "Tyagaraja","Gowrimanohari","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Guruleka_Etuvanti",
     "Tyagaraja kriti in Gowrimanohari raga. On the importance of a guru."),
    ("laavanya_rama_kannul_ara","Laavanya Rama Kannul Ara",
     "Tyagaraja","Poorna Shadjam","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Laavanya_Rama_Kannul_Ara",
     "Tyagaraja kriti in Poorna Shadjam raga."),
    ("teliyaleru_rama","Teliyaleru Rama",
     "Tyagaraja","Dhenuka","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Teliyaleru_Rama",
     "Tyagaraja kriti in Dhenuka raga."),
    # ── Muthuswami Dikshitar ───────────────────────────────────────────────
    ("sri_venkata_girisa","Sri Venkata Girisa",
     "Muthuswami Dikshitar","Suruti","Adi","Sanskrit",
     "https://en.wikipedia.org/wiki/Sri_Venkata_Girisa",
     "Muthuswami Dikshitar kriti in Suruti raga."),
    ("shri_guruna_palitosmi","Shri Guruna Palitosmi",
     "Muthuswami Dikshitar","Padi","Adi","Sanskrit",
     "https://en.wikipedia.org/wiki/Shri_Guruna_Palitosmi",
     "Muthuswami Dikshitar kriti in Padi raga. Rare raga composition."),
    ("sri_dakshinamurte","Sri Dakshinamurte",
     "Muthuswami Dikshitar","Shankarabharanam","Adi","Sanskrit",
     "https://en.wikipedia.org/wiki/Sri_Dakshinamurte",
     "Muthuswami Dikshitar kriti in Shankarabharanam raga."),
    ("amba_nilayatakshi","Amba Nilayatakshi Karunakatakshi",
     "Muthuswami Dikshitar","Neelambari","Adi","Sanskrit",
     "https://en.wikipedia.org/wiki/Amba_Nilayatakshi",
     "Muthuswami Dikshitar kriti in Neelambari raga. Part of the Kamalamba Navavarana Kritis."),
    ("kshitija_ramanam","Kshitija Ramanam",
     "Muthuswami Dikshitar","Devagandhari","Adi","Sanskrit",
     "https://en.wikipedia.org/wiki/Kshitija_Ramanam",
     "Muthuswami Dikshitar kriti in Devagandhari raga."),
    ("jambu_pathe_mam_pahi","Jambu Pathe Mam Pahi",
     "Muthuswami Dikshitar","Yamuna Kalyani","Adi","Sanskrit",
     "https://en.wikipedia.org/wiki/Jambu_Pathe_Mam_Pahi",
     "Muthuswami Dikshitar kriti in Yamuna Kalyani raga. Pancha Bhuta Stalas series (water element)."),
    ("bhajare_re_chitta_balambikam","Bhajare Re Chitta Balambikam",
     "Muthuswami Dikshitar","Kalyani","Adi","Sanskrit",
     "https://en.wikipedia.org/wiki/Bhajare_Re_Chitta_Balambikam",
     "Muthuswami Dikshitar kriti in Kalyani raga."),
    ("sri_matrubhutam","Sri Matrubhutam",
     "Muthuswami Dikshitar","Kannada","Adi","Sanskrit",
     "https://en.wikipedia.org/wiki/Sri_Matrubhutam",
     "Muthuswami Dikshitar kriti in Kannada raga."),
    # ── Shyama Shastri ────────────────────────────────────────────────────
    ("o_jagadamba","O Jagadamba",
     "Shyama Shastri","Ananda Bhairavi","Adi","Telugu",
     "https://en.wikipedia.org/wiki/O_Jagadamba",
     "Shyama Shastri kriti in Ananda Bhairavi raga. One of the Trinity's most celebrated compositions."),
    ("kamakshi_varali","Kamakshi",
     "Shyama Shastri","Varali","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Kamakshi_(Shyama_Shastri)",
     "Shyama Shastri kriti in Varali raga. A popular concert piece."),
    ("kanaka_shaila_viharini","Kanaka Shaila Viharini",
     "Shyama Shastri","Punnagavarali","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Kanaka_Shaila_Viharini",
     "Shyama Shastri kriti in Punnagavarali raga."),
    ("sarojadala_netri","Sarojadala Netri",
     "Shyama Shastri","Shankarabharanam","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Sarojadala_Netri",
     "Shyama Shastri kriti in Shankarabharanam raga."),
    # ── Swati Tirunal ─────────────────────────────────────────────────────
    ("sumasaayaka","Sumasaayaka",
     "Swati Tirunal","Karnataka Kapi","Adi","Sanskrit",
     "https://en.wikipedia.org/wiki/Sumasaayaka",
     "Swati Tirunal varnam in Karnataka Kapi raga."),
    ("saramaina_matalento","Saramaina Matalento",
     "Swati Tirunal","Behag","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Saramaina_Matalento",
     "Swati Tirunal kriti in Behag raga."),
    # ── Purandara Dasa ────────────────────────────────────────────────────
    ("jagadodharana","Jagadodharana",
     "Purandara Dasa","Kapi","Adi","Kannada",
     "https://en.wikipedia.org/wiki/Jagadodharana",
     "Purandara Dasa composition in Kapi raga. Popular devotional song on Krishna."),
    # ── Kanaka Dasa ───────────────────────────────────────────────────────
    ("baro_krishnayya","Baro Krishnayya",
     "Kanaka Dasa","Maund","Adi","Kannada",
     "https://en.wikipedia.org/wiki/Baro_Krishnayya",
     "Kanaka Dasa composition in Maund raga. Popular devotional song on Krishna."),
    # ── Vyasatirtha ───────────────────────────────────────────────────────
    ("krishna_nee_begane","Krishna Nee Begane",
     "Vyasatirtha","Yamuna Kalyani","Adi","Kannada",
     "https://en.wikipedia.org/wiki/Krishna_Nee_Begane_Baro",
     "Vyasatirtha composition in Yamuna Kalyani raga. One of the most popular Carnatic devotional songs."),
    # ── Tukaram ───────────────────────────────────────────────────────────
    ("bare_panduranga","Bare Panduranga",
     "Tukaram","Maund","Adi","Marathi",
     "https://en.wikipedia.org/wiki/Tukaram",
     "Tukaram abhang in Maund raga. Popular Varkari devotional composition."),
    # ── Ghanam Krishna Iyer ───────────────────────────────────────────────
    ("tiruvatriyur_thyagarajan","Tiruvatriyur Thyagarajan",
     "Ghanam Krishna Iyer","Atana","Adi","Tamil",
     "https://en.wikipedia.org/wiki/Ghanam_Krishna_Iyer",
     "Ghanam Krishna Iyer composition in Atana raga."),
    # ── Mysore Vasudevacharya ─────────────────────────────────────────────
    ("brocevarevarura","Brocevarevarura Ninnu Vina Raghuvara",
     "Mysore Vasudevacharya","Khamas","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Brocevarevarura",
     "Mysore Vasudevacharya kriti in Khamas raga. A popular concert piece."),
    # ── Gopalakrishna Bharathi ────────────────────────────────────────────
    ("eppo_varuvaaro","Eppo Varuvaaro",
     "Gopalakrishna Bharathi","Jonepuri","Adi","Tamil",
     "https://en.wikipedia.org/wiki/Gopalakrishna_Bharathi",
     "Gopalakrishna Bharathi composition in Jonepuri raga. A popular Tamil devotional song."),
    # ── Annamacharya ──────────────────────────────────────────────────────
    ("muddugare_yashoda","Muddugare Yashoda",
     "Annamacharya","Kurinji","Adi","Telugu",
     "https://en.wikipedia.org/wiki/Muddugare_Yashoda",
     "Annamacharya composition in Kurinji raga. A popular devotional song on Krishna and Yashoda."),
    # ── Kumara Ettendra ───────────────────────────────────────────────────
    ("gajavadhana","Gajavadhana",
     "Kumara Ettendra","Thodi","Adi","Kannada",
     "https://en.wikipedia.org/wiki/Kumara_Ettendra",
     "Kumara Ettendra composition in Thodi raga. A devotional composition on Ganesha."),
    # ── Chandrasekharendra Saraswati ──────────────────────────────────────
    ("maithrim_bhajata","Maithrim Bhajata",
     "Chandrasekharendra Saraswati","Yamuna Kalyani","Adi","Sanskrit",
     "https://en.wikipedia.org/wiki/Maithreem_Bhajata",
     "Sanskrit composition by the Kanchi Paramacharya. First performed by MS Subbulakshmi at the UN in 1966."),
    # ── Tulsidas ──────────────────────────────────────────────────────────
    ("sri_ramachandra_kripalu","Sri Ramachandra Kripalu",
     "Tulsidas","Yamuna Kalyani","Adi","Hindi",
     "https://en.wikipedia.org/wiki/Sri_Ramachandra_Kripalu",
     "Tulsidas bhajan in Yamuna Kalyani raga. A popular devotional composition on Rama."),
    # ── Rabindranath Tagore ───────────────────────────────────────────────
    ("aaguner_parashmoni","Aaguner Parashmoni Chhoao Praane",
     "Rabindranath Tagore","Bhairavi","Adi","Bengali",
     "https://en.wikipedia.org/wiki/Aaguner_Parashmoni_Chhoao_Praane",
     "Rabindranath Tagore composition. Performed by TM Krishna in Bhairavi raga."),
    # ── Subbarama Iyer ────────────────────────────────────────────────────
    ("yarukkaghilum_bhayamaa","Yarukkaghilum Bhayamaa",
     "Subbarama Iyer","Begada","Misra Chapu","Tamil",
     "https://en.wikipedia.org/wiki/Subbarama_Iyer",
     "Subbarama Iyer padam in Begada raga, Misra Chapu tala."),
]

for cid, title, comp, raga, tala, lang, wiki, notes in COMPS:
    cmd = [
        "add-composition",
        "--id", cid,
        "--title", title,
        "--composer-id", C[comp],
        "--raga-id", R[raga],
        "--tala", tala,
        "--language", lang,
        "--notes", notes,
    ]
    if wiki:
        cmd += ["--source-url", wiki, "--source-label", "Wikipedia", "--source-type", "wikipedia"]
    wc(*cmd)

print("\n=== RENDER ===")
render()
print("\nDone. Run ingest_03_youtube.py next.")
