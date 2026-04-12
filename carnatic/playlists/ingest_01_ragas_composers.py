#!/usr/bin/env python3
"""TMK Ingest - Part 1: Add missing ragas and composers. Run first."""
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
        print("[DRY] render.py")
        return
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(" ", (r.stdout + r.stderr).strip())

print("=== RAGAS ===")
RAGAS = [
    ("atana","Atana","Adana",None,"https://en.wikipedia.org/wiki/Atana","Janya of Kharaharapriya (22nd melakarta). Bold heroic character. Frequently used for Tyagaraja kritis."),
    ("dhenuka","Dhenuka",None,None,"https://en.wikipedia.org/wiki/Dhenuka_(raga)","Janya of Kharaharapriya (22nd melakarta). Pentatonic, gentle devotional character."),
    ("gowrimanohari","Gowrimanohari","Gauri Manohari",23,"https://en.wikipedia.org/wiki/Gowrimanohari","23rd melakarta (Kanakangi group). Sampurna raga, serene majestic character."),
    ("hamir_kalyani","Hamir Kalyani","Hameer Kalyani",None,"https://en.wikipedia.org/wiki/Hamir_Kalyani","Janya of Kalyani (65th melakarta). Corresponds to Hindustani Hamir. Bright expansive character."),
    ("jonepuri","Jonepuri","Janapuri,Jaunpuri",None,"https://en.wikipedia.org/wiki/Jonpuri","Janya of Natabhairavi (20th melakarta). Corresponds to Hindustani Jaunpuri. Melancholic contemplative character."),
    ("kannada","Kannada","Kaanada",None,"https://en.wikipedia.org/wiki/Kannada_(raga)","Janya of Kharaharapriya (22nd melakarta). Vakra raga, majestic dignified character. Used in Dikshitar kritis."),
    ("kannada_gowla","Kannada Gowla",None,None,"https://en.wikipedia.org/wiki/Kannada_Gowla","Janya of Mayamalavagowla (15th melakarta). Rare raga. Tyagaraja composed Sogasu Chooda in this raga."),
    ("karnataka_kapi","Karnataka Kapi",None,None,"https://en.wikipedia.org/wiki/Karnataka_Kapi","Janya raga distinct from Kapi. Used in padams and varnams. Swati Tirunal's Sumasaayaka is a well-known composition."),
    ("kurinji","Kurinji","Kurinjii",None,"https://en.wikipedia.org/wiki/Kurinji_(raga)","Janya of Kharaharapriya (22nd melakarta). Pentatonic, sweet romantic character."),
    ("maund","Maund","Mand",None,"https://en.wikipedia.org/wiki/Mand_(raga)","Janya of Kharaharapriya (22nd melakarta). Corresponds to Hindustani Mand. Gentle folk-like character, popular for bhajans."),
    ("nalinakanthi","Nalinakanthi","Nalinakanti",None,"https://en.wikipedia.org/wiki/Nalinakanthi","Janya of Shankarabharanam (29th melakarta). Pentatonic, bright cheerful character."),
    ("neelambari","Neelambari","Nilambari",None,"https://en.wikipedia.org/wiki/Neelambari","Janya of Shankarabharanam (29th melakarta). Associated with lullabies and the divine. Dikshitar composed several kritis here."),
    ("padi","Padi",None,None,"https://en.wikipedia.org/wiki/Padi_(raga)","Janya of Mayamalavagowla (15th melakarta). Rare raga used by Dikshitar. Shri Guruna Palitosmi is a well-known kriti."),
    ("purvi","Purvi","Poorvi",None,"https://en.wikipedia.org/wiki/Purvi_(raga)","Corresponds to Hindustani Purvi. Serious evening raga, contemplative character. Used by Dikshitar."),
    ("ravi_chandrika","Ravi Chandrika","Ravichandrika",None,"https://en.wikipedia.org/wiki/Ravi_Chandrika","Janya of Shankarabharanam (29th melakarta). Rare raga used by Tyagaraja."),
    ("simhavahini","Simhavahini","Simhavahana",None,"https://en.wikipedia.org/wiki/Simhavahini","Janya of Shankarabharanam (29th melakarta). Rare raga. Tyagaraja's Nenarunchara is a well-known kriti."),
    ("suruti","Suruti","Surutti",None,"https://en.wikipedia.org/wiki/Surutti","Janya of Kharaharapriya (22nd melakarta). Vakra raga, rich emotive character. Dikshitar's Sri Venkata Girisa is in this raga."),
    ("thodi","Thodi","Todi,Shubhapantuvarali",8,"https://en.wikipedia.org/wiki/Todi_(Carnatic_raga)","8th melakarta (Todi group). One of the most important ragas in Carnatic music. Deep emotive character, parent of many janya ragas."),
    ("yadukulakhamboji","Yadukulakhamboji","Yadukula Kambhoji",None,"https://en.wikipedia.org/wiki/Yadukulakambhoji","Janya of Harikambhoji (28th melakarta). Pentatonic, bright devotional character. Tyagaraja's Hecharikaga is a well-known kriti."),
    ("yaman_kalyan","Yaman Kalyan","Yaman",None,"https://en.wikipedia.org/wiki/Yaman_Kalyan","Corresponds to Hindustani Yaman Kalyan. Related to Carnatic Kalyani. Used for bhajans and devotional music."),
    ("yamuna_kalyani","Yamuna Kalyani","Yamunakalyani",None,"https://en.wikipedia.org/wiki/Yamuna_Kalyani","Janya of Kalyani (65th melakarta). Pentatonic, bright devotional character. Dikshitar's Jambu Pathe Mam Pahi is in this raga."),
]
for rid, name, aliases, mel, wiki, notes in RAGAS:
    cmd = ["add-raga","--id",rid,"--name",name,"--source-url",wiki,"--source-label","Wikipedia","--source-type","wikipedia","--notes",notes]
    if aliases: cmd += ["--aliases", aliases]
    if mel is not None: cmd += ["--melakarta", str(mel)]
    wc(*cmd)

print("\n=== COMPOSERS ===")
COMPOSERS = [
    ("annamacharya","Annamacharya",1408,1503,"https://en.wikipedia.org/wiki/Annamacharya"),
    ("basava","Basava",1131,1167,"https://en.wikipedia.org/wiki/Basava"),
    ("chandrasekharendra_saraswati","Chandrasekharendra Saraswati",1894,1994,"https://en.wikipedia.org/wiki/Chandrasekharendra_Saraswati"),
    ("dv_gundappa","DV Gundappa",1887,1975,"https://en.wikipedia.org/wiki/D._V._Gundappa"),
    ("ghanam_krishna_iyer","Ghanam Krishna Iyer",1781,1856,"https://en.wikipedia.org/wiki/Ghanam_Krishna_Iyer"),
    ("gopalakrishna_bharathi","Gopalakrishna Bharathi",1811,1896,"https://en.wikipedia.org/wiki/Gopalakrishna_Bharathi"),
    ("kanaka_dasa","Kanaka Dasa",1509,1609,"https://en.wikipedia.org/wiki/Kanaka_Dasa"),
    ("kumara_ettendra","Kumara Ettendra",None,None,"https://en.wikipedia.org/wiki/Kumara_Ettendra"),
    ("muthiah_bhagavathar","Muthiah Bhagavathar",1877,1945,"https://en.wikipedia.org/wiki/Harikesanallur_Muthiah_Bhagavathar"),
    ("mysore_vasudevacharya","Mysore Vasudevacharya",1865,1961,"https://en.wikipedia.org/wiki/Mysore_Vasudevacharya"),
    ("perumal_murugan","Perumal Murugan",1966,None,"https://en.wikipedia.org/wiki/Perumal_Murugan"),
    ("purandara_dasa","Purandara Dasa",1484,1564,"https://en.wikipedia.org/wiki/Purandaradasa"),
    ("rabindranath_tagore","Rabindranath Tagore",1861,1941,"https://en.wikipedia.org/wiki/Rabindranath_Tagore"),
    ("subbarama_iyer","Subbarama Iyer",None,None,"https://en.wikipedia.org/wiki/Subbarama_Iyer"),
    ("tukaram","Tukaram",1598,1650,"https://en.wikipedia.org/wiki/Tukaram"),
    ("tulsidas","Tulsidas",1532,1623,"https://en.wikipedia.org/wiki/Tulsidas"),
    ("vyasatirtha","Vyasatirtha",1460,1539,"https://en.wikipedia.org/wiki/Vyasatirtha"),
]
for cid, name, born, died, wiki in COMPOSERS:
    cmd = ["add-composer","--id",cid,"--name",name,"--source-url",wiki,"--source-label","Wikipedia","--source-type","wikipedia"]
    if born is not None: cmd += ["--born", str(born)]
    if died is not None: cmd += ["--died", str(died)]
    wc(*cmd)

print("\n=== RENDER ===")
render()
print("\nDone. Run ingest_02_compositions.py next.")
