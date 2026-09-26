export interface PollingUnit {
  id: string;
  code: string;
  name: string;
  /** Newly created/added polling unit (used by lgas/*.ts data files). */
  isNew?: boolean;
}

export interface Ward {
  id: string;
  code: string;
  name: string;
  pollingUnits: PollingUnit[];
}

export const nkanuWestElectoralData: Ward[] = [
  {
    id: "nkanu-west-ward-01",
    code: "01",
    name: "Agbani",
    pollingUnits: [
      {
        id: "nkanu-west-ward-01-pu-001",
        code: "001",
        name: "COMMUNITY SCHOOL MBOGODO I",
      },
      {
        id: "nkanu-west-ward-01-pu-002",
        code: "002",
        name: "COMMUNITY SCHOOL MBOGODO II",
      },
      {
        id: "nkanu-west-ward-01-pu-003",
        code: "003",
        name: "PRIMARY SCHOOL OGBEKE I",
      },
      {
        id: "nkanu-west-ward-01-pu-004",
        code: "004",
        name: "GROUP SCHOOL AGBANI",
      },
      {
        id: "nkanu-west-ward-01-pu-005",
        code: "005",
        name: "STATION PRIMARY SCHOOL AGBANI I",
      },
      {
        id: "nkanu-west-ward-01-pu-006",
        code: "006",
        name: "CENTRAL SCHOOL AGBANI I",
      },
      {
        id: "nkanu-west-ward-01-pu-007",
        code: "007",
        name: "NVU AMAKPU VILLAGE HALL",
      },
      {
        id: "nkanu-west-ward-01-pu-008",
        code: "008",
        name: "UKWA VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-01-pu-009",
        code: "009",
        name: "NDIAGU OGBEKE SQUARE",
      },
      {
        id: "nkanu-west-ward-01-pu-010",
        code: "010",
        name: "UKURUTA TOWN HALL",
      },
      {
        id: "nkanu-west-ward-01-pu-011",
        code: "011",
        name: "PRIMARY SCHOOL OGBEKE II",
      },
      {
        id: "nkanu-west-ward-01-pu-012",
        code: "012",
        name: "OJIAGU TOWN HALL",
      },
      {
        id: "nkanu-west-ward-01-pu-013",
        code: "013",
        name: "STATION PRIMARY SCHOOL AGBANI II",
      },
      {
        id: "nkanu-west-ward-01-pu-014",
        code: "014",
        name: "COMMUNITY SECONDARY SCHOOL AGBANI",
      },
      {
        id: "nkanu-west-ward-01-pu-015",
        code: "015",
        name: "ALLINS COMMERCIAL SCHOOL AGBANI",
      },
      {
        id: "nkanu-west-ward-01-pu-016",
        code: "016",
        name: "CENTRAL SCHOOL, AGBANI II",
      },
      {
        id: "nkanu-west-ward-01-pu-017",
        code: "017",
        name: "UMUONWE VILLAGE HALL AGBANI",
      },
      {
        id: "nkanu-west-ward-01-pu-018",
        code: "018",
        name: "OGWE-AJEME VILLAGE SQUARE AGBANI",
      },
      {
        id: "nkanu-west-ward-01-pu-021",
        code: "021",
        name: "AGBANI ULTRA MODERN MKT I",
      },
      {
        id: "nkanu-west-ward-01-pu-022",
        code: "022",
        name: "AGBANI ULTRA MODERN MKT II",
      },
      {
        id: "nkanu-west-ward-01-pu-023",
        code: "023",
        name: "GENERAL HOSPITAL AGBANI",
      },
      {
        id: "nkanu-west-ward-01-pu-024",
        code: "024",
        name: "EZIOBODO TOWN HALL",
      },
      {
        id: "nkanu-west-ward-01-pu-025",
        code: "025",
        name: "AMAINYI AMAKPU TOWN HALL",
      },
      {
        id: "nkanu-west-ward-01-pu-026",
        code: "026",
        name: "ESUT BACK GATE AGBANI",
      },
      {
        id: "nkanu-west-ward-01-pu-027",
        code: "027",
        name: "AMAKATANGA VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-01-pu-028",
        code: "028",
        name: "PRIMARY HEALTH CENTRE OJIAGU",
      },
      {
        id: "nkanu-west-ward-01-pu-029",
        code: "029",
        name: "ENUGU STATE JUDICIARY HIGH COURT I",
      },
      {
        id: "nkanu-west-ward-01-pu-030",
        code: "030",
        name: "ENUGU STATE JUDICIARY HIGH COURT II",
      },
    ],
  },
  {
    id: "nkanu-west-ward-02",
    code: "02",
    name: "Amurri",
    pollingUnits: [
      {
        id: "nkanu-west-ward-02-pu-001",
        code: "001",
        name: "OBODO OJIRI VILLAGE SQUARE I",
      },
      {
        id: "nkanu-west-ward-02-pu-002",
        code: "002",
        name: "COMMUNITY CENTRAL SCHOOL EZIOKWE I",
      },
      {
        id: "nkanu-west-ward-02-pu-003",
        code: "003",
        name: "COMMUNITY CENTRAL SCHOOL EZIOKWE II",
      },
      {
        id: "nkanu-west-ward-02-pu-004",
        code: "004",
        name: "PRIMARY SCHOOL OBEAGU",
      },
      {
        id: "nkanu-west-ward-02-pu-005",
        code: "005",
        name: "COMMUNITY CENTRAL SCHOOL UMUIGBO",
      },
      {
        id: "nkanu-west-ward-02-pu-006",
        code: "006",
        name: "PRIMARY SCHOOL AMANKANU",
      },
      {
        id: "nkanu-west-ward-02-pu-007",
        code: "007",
        name: "COMMUNITY SCHOOL AMANKANU",
      },
      {
        id: "nkanu-west-ward-02-pu-008",
        code: "008",
        name: "COMMUNITY PRIMARY SCHOOL ENUAGU I",
      },
      {
        id: "nkanu-west-ward-02-pu-009",
        code: "009",
        name: "UPATA PRIMARY SCHOOL I",
      },
      {
        id: "nkanu-west-ward-02-pu-010",
        code: "010",
        name: "UMUEDUM VILLAGE HALL",
      },
      {
        id: "nkanu-west-ward-02-pu-011",
        code: "011",
        name: "IHUNGWU VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-02-pu-012",
        code: "012",
        name: "AFFIA NWAKPATA SQUARE",
      },
      {
        id: "nkanu-west-ward-02-pu-013",
        code: "013",
        name: "OBINAGU EZIOKWE VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-02-pu-014",
        code: "014",
        name: "OBODO OKOLO CHUKWU VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-02-pu-015",
        code: "015",
        name: "OBODO IDE UMUAGBU-ENUGU VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-02-pu-016",
        code: "016",
        name: "COMMUNITY PRIMARY SCHOOL ENUAGU II",
      },
      { id: "nkanu-west-ward-02-pu-017", code: "017", name: "AMACHARA SQUARE" },
      {
        id: "nkanu-west-ward-02-pu-018",
        code: "018",
        name: "NKWO MARKET SQUARE",
      },
      {
        id: "nkanu-west-ward-02-pu-019",
        code: "019",
        name: "OBODO OJIRI VILLAGE SQUARE II",
      },
      {
        id: "nkanu-west-ward-02-pu-020",
        code: "020",
        name: "UMUIGBO VILLAGE HALL",
      },
    ],
  },
  {
    id: "nkanu-west-ward-03",
    code: "03",
    name: "Akegbe-Ugwu Okwuo",
    pollingUnits: [
      {
        id: "nkanu-west-ward-03-pu-001",
        code: "001",
        name: "COMMUNITY CENTRAL SCHOOL AKEGBE-UGWU",
      },
      {
        id: "nkanu-west-ward-03-pu-002",
        code: "002",
        name: "OBEAGU TOWN HALL I",
      },
      {
        id: "nkanu-west-ward-03-pu-003",
        code: "003",
        name: "COMMUNITY PRIMARY SCHOOL AMIGBO",
      },
      {
        id: "nkanu-west-ward-03-pu-004",
        code: "004",
        name: "AGWUNATO TOWN HALL",
      },
      {
        id: "nkanu-west-ward-03-pu-005",
        code: "005",
        name: "GIRLS’ HIGH SCHOOL, AKEGBE-UGWU",
      },
      {
        id: "nkanu-west-ward-03-pu-006",
        code: "006",
        name: "OBEAGU TOWN HALL II",
      },
      {
        id: "nkanu-west-ward-03-pu-007",
        code: "007",
        name: "NDIAGU UMUOKWO HEALTH CENTRE",
      },
    ],
  },
  {
    id: "nkanu-west-ward-04",
    code: "04",
    name: "Amodu",
    pollingUnits: [
      {
        id: "nkanu-west-ward-04-pu-001",
        code: "001",
        name: "COMMUNITY SCHOOL AMODU I",
      },
      {
        id: "nkanu-west-ward-04-pu-002",
        code: "002",
        name: "COMMUNITY SCHOOL AMODU II",
      },
      {
        id: "nkanu-west-ward-04-pu-003",
        code: "003",
        name: "AMODU NIGHT MARKET SQUARE I",
      },
      {
        id: "nkanu-west-ward-04-pu-004",
        code: "004",
        name: "AMODU ACHALLA TOWN HALL I",
      },
      {
        id: "nkanu-west-ward-04-pu-005",
        code: "005",
        name: "UNION PRIMARY SCHOOL AMODU I",
      },
      {
        id: "nkanu-west-ward-04-pu-006",
        code: "006",
        name: "UNION PRIMARY SCHOOL AMODU II",
      },
      {
        id: "nkanu-west-ward-04-pu-007",
        code: "007",
        name: "ENUGU-UGBUAKPU SQUARE",
      },
      {
        id: "nkanu-west-ward-04-pu-008",
        code: "008",
        name: "ACHARA ORIE ODENIGBO SQUARE",
      },
      {
        id: "nkanu-west-ward-04-pu-009",
        code: "009",
        name: "IHU-UNO ANI AGU SQUARE",
      },
      { id: "nkanu-west-ward-04-pu-010", code: "010", name: "UMUOLOME HALL" },
    ],
  },
  {
    id: "nkanu-west-ward-05",
    code: "05",
    name: "Obuoffia",
    pollingUnits: [
      {
        id: "nkanu-west-ward-05-pu-001",
        code: "001",
        name: "CENTRAL SCHOOL OBUOFFIA I",
      },
      {
        id: "nkanu-west-ward-05-pu-002",
        code: "002",
        name: "AMANGWU CIVIC CENTRE",
      },
      {
        id: "nkanu-west-ward-05-pu-003",
        code: "003",
        name: "ISIOFOR TOWN HALL OBUOFFIA",
      },
      {
        id: "nkanu-west-ward-05-pu-004",
        code: "004",
        name: "IHEANI AWKUNANAW CENTRAL HALL I",
      },
      {
        id: "nkanu-west-ward-05-pu-005",
        code: "005",
        name: "UMUIBA HALL OBUOFFIA",
      },
      {
        id: "nkanu-west-ward-05-pu-006",
        code: "006",
        name: "OBUOFFIA OBE, OBUOFFIA VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-05-pu-007",
        code: "007",
        name: "IHEANI AWKUNANAW CENTRAL HALL II",
      },
      {
        id: "nkanu-west-ward-05-pu-008",
        code: "008",
        name: "CENTRAL SCHOOL OBUOFFIA II",
      },
      {
        id: "nkanu-west-ward-05-pu-009",
        code: "009",
        name: "AKAKORO VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-05-pu-010",
        code: "010",
        name: "OBODOAGBA TOWN HALL",
      },
    ],
  },
  {
    id: "nkanu-west-ward-06",
    code: "06",
    name: "Obe",
    pollingUnits: [
      {
        id: "nkanu-west-ward-06-pu-001",
        code: "001",
        name: "COMMUNITY CENTRAL SCHOOL I",
      },
      {
        id: "nkanu-west-ward-06-pu-002",
        code: "002",
        name: "COMMUNITY CENTRAL SCHOOL II",
      },
      {
        id: "nkanu-west-ward-06-pu-003",
        code: "003",
        name: "OBODO ONU VILLAGE SQUARE I",
      },
      {
        id: "nkanu-west-ward-06-pu-004",
        code: "004",
        name: "UNION PRIMARY SCHOOL",
      },
      {
        id: "nkanu-west-ward-06-pu-005",
        code: "005",
        name: "COMMUNITY SCHOOL ENUGU OBE I",
      },
      {
        id: "nkanu-west-ward-06-pu-006",
        code: "006",
        name: "TECHNICAL SCH. OBE I",
      },
      {
        id: "nkanu-west-ward-06-pu-007",
        code: "007",
        name: "GIRLS’ SECONDARY SCHOOL OBE I",
      },
      {
        id: "nkanu-west-ward-06-pu-008",
        code: "008",
        name: "UNION PRIMARY SCHOOL OBE II",
      },
      {
        id: "nkanu-west-ward-06-pu-009",
        code: "009",
        name: "COMMUNITY SCHOOL ENUGU OBE II",
      },
      {
        id: "nkanu-west-ward-06-pu-010",
        code: "010",
        name: "TECHNICAL SCH. OBE II",
      },
      {
        id: "nkanu-west-ward-06-pu-011",
        code: "011",
        name: "OBODO ONU VILLAGE SQUARE II",
      },
      {
        id: "nkanu-west-ward-06-pu-012",
        code: "012",
        name: "UGWU MKPUME VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-06-pu-013",
        code: "013",
        name: "EZIOBODO ENUGU OBE VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-06-pu-014",
        code: "014",
        name: "UKWUDARA IHUWUAKO VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-06-pu-015",
        code: "015",
        name: "ORIE MARKET VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-06-pu-016",
        code: "016",
        name: "UGWU NKPUME MARKET SQUARE",
      },
      {
        id: "nkanu-west-ward-06-pu-017",
        code: "017",
        name: "CIVIC CENTRE OBE UNO",
      },
      {
        id: "nkanu-west-ward-06-pu-018",
        code: "018",
        name: "OBE HEALTH CENTRE",
      },
    ],
  },
  {
    id: "nkanu-west-ward-07",
    code: "07",
    name: "Ozalla",
    pollingUnits: [
      {
        id: "nkanu-west-ward-07-pu-001",
        code: "001",
        name: "COMMUNITY PRIMARY SCHOOL AMIGBO I",
      },
      {
        id: "nkanu-west-ward-07-pu-002",
        code: "002",
        name: "NKWO MARKET SQUARE",
      },
      {
        id: "nkanu-west-ward-07-pu-003",
        code: "003",
        name: "OBODO OKWE COMMUNITY HALL",
      },
      {
        id: "nkanu-west-ward-07-pu-004",
        code: "004",
        name: "RIVER-SIDE PRIMARY SCHOOL",
      },
      {
        id: "nkanu-west-ward-07-pu-005",
        code: "005",
        name: "COMMUNITY PRIMARY SCHOOL OBEAGWU",
      },
      {
        id: "nkanu-west-ward-07-pu-006",
        code: "006",
        name: "UGWU-OHANE VILLAGE HALL",
      },
      {
        id: "nkanu-west-ward-07-pu-007",
        code: "007",
        name: "EKE MARKET SQUARE",
      },
      {
        id: "nkanu-west-ward-07-pu-008",
        code: "008",
        name: "CENTRAL SCHOOL OZALLA I",
      },
      {
        id: "nkanu-west-ward-07-pu-009",
        code: "009",
        name: "CENTRAL SCHOOL OZALLA II",
      },
      { id: "nkanu-west-ward-07-pu-010", code: "010", name: "COURT PREMISES" },
      {
        id: "nkanu-west-ward-07-pu-011",
        code: "011",
        name: "UMU-OKOLOUBA HALL",
      },
      {
        id: "nkanu-west-ward-07-pu-012",
        code: "012",
        name: "BOYS’ SECONDARY SCHOOL",
      },
      {
        id: "nkanu-west-ward-07-pu-013",
        code: "013",
        name: "UMUAGU VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-07-pu-014",
        code: "014",
        name: "UMUONYIA ANEE VILLAGE HALL",
      },
      {
        id: "nkanu-west-ward-07-pu-015",
        code: "015",
        name: "UKPAETTE VILLAGE SQUARE I",
      },
      {
        id: "nkanu-west-ward-07-pu-016",
        code: "016",
        name: "UMUANIAGU VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-07-pu-017",
        code: "017",
        name: "RIVER-SIDE PRIMARY SCHOOL II",
      },
      {
        id: "nkanu-west-ward-07-pu-018",
        code: "018",
        name: "COMMUNITY PRIMARY SCHOOL AMIGBO II",
      },
      {
        id: "nkanu-west-ward-07-pu-019",
        code: "019",
        name: "ONU-AKPARATA UMUEKWE VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-07-pu-020",
        code: "020",
        name: "UMUNGWU VILLAGE SQUARE-UMUOKOLOUBA",
      },
      {
        id: "nkanu-west-ward-07-pu-021",
        code: "021",
        name: "NDIUNO ENUAGU AGU VILLAGE SQUARE",
      },
      { id: "nkanu-west-ward-07-pu-022", code: "022", name: "UMUHU OZALLA" },
    ],
  },
  {
    id: "nkanu-west-ward-08",
    code: "08",
    name: "Obinagu Uwani",
    pollingUnits: [
      {
        id: "nkanu-west-ward-08-pu-001",
        code: "001",
        name: "OBINAGU UWANI OGIRISHI VILLAGE SQUARE I",
      },
      {
        id: "nkanu-west-ward-08-pu-002",
        code: "002",
        name: "AMAOWELLE TOWN HALL",
      },
      { id: "nkanu-west-ward-08-pu-003", code: "003", name: "ANIYI TOWN HALL" },
      {
        id: "nkanu-west-ward-08-pu-004",
        code: "004",
        name: "COMMUNITY SCHOOL AMEKE",
      },
      {
        id: "nkanu-west-ward-08-pu-005",
        code: "005",
        name: "AMAKPU TOWN HALL",
      },
      {
        id: "nkanu-west-ward-08-pu-006",
        code: "006",
        name: "COMMUNITY SECONDARY SCHOOL OBINAGU I",
      },
      {
        id: "nkanu-west-ward-08-pu-007",
        code: "007",
        name: "COMMUNITY SECONDARY SCHOOL OBINAGU II",
      },
      {
        id: "nkanu-west-ward-08-pu-008",
        code: "008",
        name: "OBINAGU UWANI OGIRISHI VILLAGE SQUARE II",
      },
      {
        id: "nkanu-west-ward-08-pu-009",
        code: "009",
        name: "COMM. SEC. SCHOOL OBINAGU III",
      },
      {
        id: "nkanu-west-ward-08-pu-010",
        code: "010",
        name: "ST THERESA PRIMARY SCHOOL OBINAGU UWANI",
      },
    ],
  },
  {
    id: "nkanu-west-ward-09",
    code: "09",
    name: "Akpugo II",
    pollingUnits: [
      {
        id: "nkanu-west-ward-09-pu-001",
        code: "001",
        name: "NVUAJA VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-09-pu-002",
        code: "002",
        name: "OBODO OKPUBE VILLAGE HALL NDIAGU, AKPUGO II",
      },
      {
        id: "nkanu-west-ward-09-pu-003",
        code: "003",
        name: "CENTRAL SCHOOL, NDIAGU OBUNO",
      },
      {
        id: "nkanu-west-ward-09-pu-004",
        code: "004",
        name: "UBOGU VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-09-pu-005",
        code: "005",
        name: "OKETOKE VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-09-pu-006",
        code: "006",
        name: "AMAUZAM VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-09-pu-007",
        code: "007",
        name: "NKWO NNAJIONA AMAKWO HALL II",
      },
      {
        id: "nkanu-west-ward-09-pu-008",
        code: "008",
        name: "ONUORIE OBUNO VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-09-pu-009",
        code: "009",
        name: "AMANGWU VILLAGE HALL",
      },
      {
        id: "nkanu-west-ward-09-pu-010",
        code: "010",
        name: "AMAFOR OBUNO VILLAGE HALL",
      },
      {
        id: "nkanu-west-ward-09-pu-011",
        code: "011",
        name: "ODIHENE VILLAGE HALL",
      },
      {
        id: "nkanu-west-ward-09-pu-012",
        code: "012",
        name: "CENTRAL SCHOOL MGBERE AKPUGO",
      },
      {
        id: "nkanu-west-ward-09-pu-013",
        code: "013",
        name: "ACHARA VILLAGE HALL",
      },
    ],
  },
  {
    id: "nkanu-west-ward-10",
    code: "10",
    name: "Akpugo III",
    pollingUnits: [
      {
        id: "nkanu-west-ward-10-pu-001",
        code: "001",
        name: "EKE NVU AMEKE VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-10-pu-002",
        code: "002",
        name: "COMMUNITY SCHOOL AMEDE",
      },
      {
        id: "nkanu-west-ward-10-pu-003",
        code: "003",
        name: "COMMUNITY CENTRAL SCHOOL, AMEDE",
      },
      {
        id: "nkanu-west-ward-10-pu-004",
        code: "004",
        name: "BOYS’ SECONDARY SCHOOL I",
      },
      {
        id: "nkanu-west-ward-10-pu-005",
        code: "005",
        name: "UWANI AGBEDE VILLAGE",
      },
      {
        id: "nkanu-west-ward-10-pu-006",
        code: "006",
        name: "AMEKE CENTRTAL VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-10-pu-007",
        code: "007",
        name: "NDIUZU VILLAGE HALL IHUNEKWAGU",
      },
      {
        id: "nkanu-west-ward-10-pu-008",
        code: "008",
        name: "COMMUNITY SECONDARY SCHOOL II",
      },
      {
        id: "nkanu-west-ward-10-pu-009",
        code: "009",
        name: "CENTRAL SCHOOL DEJI NDIUNO, AKPUGO I",
      },
      {
        id: "nkanu-west-ward-10-pu-010",
        code: "010",
        name: "COMMNITY SCHOOL IHUNEKWAGU I",
      },
      {
        id: "nkanu-west-ward-10-pu-011",
        code: "011",
        name: "BOYS’ SECONDARY SCHOOL II",
      },
      {
        id: "nkanu-west-ward-10-pu-012",
        code: "012",
        name: "COMMUNITY SCHOOL, IHUNEKWAGU II",
      },
      {
        id: "nkanu-west-ward-10-pu-013",
        code: "013",
        name: "COMMUNITY SECONDARY SCHOOL I",
      },
      {
        id: "nkanu-west-ward-10-pu-014",
        code: "014",
        name: "CENTRAL SCHOOL DEJI NDIUNO, AKPUGO II",
      },
      {
        id: "nkanu-west-ward-10-pu-015",
        code: "015",
        name: "OGBASHI VILLAGE SQUARE AMA-UGO AGU DEJI UNO I",
      },
      {
        id: "nkanu-west-ward-10-pu-016",
        code: "016",
        name: "OGBASHI VILLAGE SQUARE AMA-UGO AGU DEJI UNO II",
      },
    ],
  },
  {
    id: "nkanu-west-ward-11",
    code: "11",
    name: "Akpugo IV",
    pollingUnits: [
      {
        id: "nkanu-west-ward-11-pu-001",
        code: "001",
        name: "COMMUNITY SCHOOL DEJI NDIAGU I",
      },
      {
        id: "nkanu-west-ward-11-pu-002",
        code: "002",
        name: "GROUP SCHOOL DEJI NDIAGU",
      },
      {
        id: "nkanu-west-ward-11-pu-003",
        code: "003",
        name: "COMMUNITY SCHOOL UGWUAFOR",
      },
      {
        id: "nkanu-west-ward-11-pu-004",
        code: "004",
        name: "PRIMARY SCHOOL ONUZAGBA",
      },
      {
        id: "nkanu-west-ward-11-pu-005",
        code: "005",
        name: "UVUAGBA TOWN HALL I",
      },
      {
        id: "nkanu-west-ward-11-pu-006",
        code: "006",
        name: "ENUGU-AGU VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-11-pu-007",
        code: "007",
        name: "UVAGBA TOWN HALL II",
      },
      {
        id: "nkanu-west-ward-11-pu-008",
        code: "008",
        name: "ONU-AKPATA VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-11-pu-009",
        code: "009",
        name: "ONUEKE TOWN HALL",
      },
      {
        id: "nkanu-west-ward-11-pu-010",
        code: "010",
        name: "ONUAFOR ANIEDE VILLAGE HALL",
      },
      {
        id: "nkanu-west-ward-11-pu-011",
        code: "011",
        name: "OGONANO VILLAGE SQUARE OGBOZINE I",
      },
      {
        id: "nkanu-west-ward-11-pu-012",
        code: "012",
        name: "COMMUNITY SCHOOL DEJI NDIAGU II",
      },
      {
        id: "nkanu-west-ward-11-pu-013",
        code: "013",
        name: "AMOJI VILLAGE HALL",
      },
      {
        id: "nkanu-west-ward-11-pu-014",
        code: "014",
        name: "ONICHAGU VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-11-pu-015",
        code: "015",
        name: "UZZAM AGU VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-11-pu-016",
        code: "016",
        name: "IFEANISHENE VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-11-pu-017",
        code: "017",
        name: "ONUEKO VILLAGE ONICHA AGU",
      },
      {
        id: "nkanu-west-ward-11-pu-018",
        code: "018",
        name: "OBODO AJA VILLAGE SQUARE",
      },
    ],
  },
  {
    id: "nkanu-west-ward-12",
    code: "12",
    name: "Umueze",
    pollingUnits: [
      {
        id: "nkanu-west-ward-12-pu-001",
        code: "001",
        name: "NDIAGU ETITI VILLAGE SQUARE I",
      },
      {
        id: "nkanu-west-ward-12-pu-002",
        code: "002",
        name: "COMMUNITY SCHOOL I, UMUEZE",
      },
      {
        id: "nkanu-west-ward-12-pu-003",
        code: "003",
        name: "COMMUNITY SCHOOL II, UMUEZE",
      },
      {
        id: "nkanu-west-ward-12-pu-004",
        code: "004",
        name: "BOYS’ SECONDARY SCHOOL, UMUEZE I",
      },
      {
        id: "nkanu-west-ward-12-pu-005",
        code: "005",
        name: "NDIAGU ETITI VILLAGE SQUARE II",
      },
      {
        id: "nkanu-west-ward-12-pu-006",
        code: "006",
        name: "UMUEZE AWKUNANAW TOWN HALL",
      },
      {
        id: "nkanu-west-ward-12-pu-007",
        code: "007",
        name: "UMUEZE AWKUNANW HEALTH CENTRE",
      },
      {
        id: "nkanu-west-ward-12-pu-008",
        code: "008",
        name: "CUSTOMARY COURT UMUEZE",
      },
    ],
  },
  {
    id: "nkanu-west-ward-13",
    code: "13",
    name: "Ibite Akegbe Ugwu",
    pollingUnits: [
      {
        id: "nkanu-west-ward-13-pu-001",
        code: "001",
        name: "PRIMARY SCHOOL ATTAKWU I",
      },
      {
        id: "nkanu-west-ward-13-pu-002",
        code: "002",
        name: "PRIMARY SCHOOL ATTAKWU II",
      },
      {
        id: "nkanu-west-ward-13-pu-003",
        code: "003",
        name: "NKWO ONUGWU MARKET SQUARE",
      },
      {
        id: "nkanu-west-ward-13-pu-004",
        code: "004",
        name: "PRIMARY SCHOOL AMAGU I",
      },
      {
        id: "nkanu-west-ward-13-pu-005",
        code: "005",
        name: "UGWU OYOVO MARKET SQUARE",
      },
      {
        id: "nkanu-west-ward-13-pu-006",
        code: "006",
        name: "CENTRAL SCHOOL AKEGBE-UGWU I",
      },
      {
        id: "nkanu-west-ward-13-pu-007",
        code: "007",
        name: "OBODO ENEOKO VILLAGE SQUARE",
      },
      {
        id: "nkanu-west-ward-13-pu-008",
        code: "008",
        name: "EGBU VILLAGE MARKET SQUARE",
      },
      {
        id: "nkanu-west-ward-13-pu-009",
        code: "009",
        name: "COMPREHENSIVE SECONDARY SCHOOL AKPASHA",
      },
      {
        id: "nkanu-west-ward-13-pu-010",
        code: "010",
        name: "CENTRAL SCHOOL AKEGBE-UGWU II",
      },
      {
        id: "nkanu-west-ward-13-pu-011",
        code: "011",
        name: "PRIMARY SCHOOL AMAGU II",
      },
      {
        id: "nkanu-west-ward-13-pu-012",
        code: "012",
        name: "S.S.T. AKEGBE-UGWU",
      },
      {
        id: "nkanu-west-ward-13-pu-013",
        code: "013",
        name: "OGBO-OWO VILLAGE SQUARE I",
      },
      {
        id: "nkanu-west-ward-13-pu-014",
        code: "014",
        name: "OGBO-OWO VILLAGE SQUARE II",
      },
      {
        id: "nkanu-west-ward-13-pu-015",
        code: "015",
        name: "OBODO UWANI VILLAGE HALL",
      },
      {
        id: "nkanu-west-ward-13-pu-016",
        code: "016",
        name: "UMUANIAGU UMUODEANI VILLAGE HALL",
      },
      {
        id: "nkanu-west-ward-13-pu-017",
        code: "017",
        name: "ATTAKWU CIVIC CENTRE",
      },
    ],
  },
  {
    id: "nkanu-west-ward-14",
    code: "14",
    name: "Ndiuno Uwani",
    pollingUnits: [
      {
        id: "nkanu-west-ward-14-pu-001",
        code: "001",
        name: "NDIUNO UWANI COMMUNITY SCHOOL I",
      },
      {
        id: "nkanu-west-ward-14-pu-002",
        code: "002",
        name: "AMAETITI CENTRAL VILLAGE HALL",
      },
      {
        id: "nkanu-west-ward-14-pu-003",
        code: "003",
        name: "ONUEKE VILLAGE SQUARE HALL",
      },
      {
        id: "nkanu-west-ward-14-pu-004",
        code: "004",
        name: "CENTRAL SCHOOL AKPUGO I",
      },
      {
        id: "nkanu-west-ward-14-pu-005",
        code: "005",
        name: "CENTRAL SCHOOL AKPUGO II",
      },
      {
        id: "nkanu-west-ward-14-pu-006",
        code: "006",
        name: "NDIUNO UWANI COMM. SCHOOL II",
      },
      { id: "nkanu-west-ward-14-pu-007", code: "007", name: "AJAME TOWN HALL" },
      {
        id: "nkanu-west-ward-14-pu-008",
        code: "008",
        name: "OBODO EDE OGIRISHI TOWN HALL",
      },
    ],
  },
];

export function getWardById(wardId: string): Ward | undefined {
  return nkanuWestElectoralData.find((ward) => ward.id === wardId);
}

export function getPollingUnitsByWard(wardId: string): PollingUnit[] {
  return getWardById(wardId)?.pollingUnits ?? [];
}

export function getPollingUnitById(
  pollingUnitId: string,
): PollingUnit | undefined {
  for (const ward of nkanuWestElectoralData) {
    const pollingUnit = ward.pollingUnits.find((pu) => pu.id === pollingUnitId);

    if (pollingUnit) return pollingUnit;
  }

  return undefined;
}

