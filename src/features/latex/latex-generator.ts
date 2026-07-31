import type {
  BlockNode,
  ChatDocumentAst,
  ChatMessageAst,
  ImageBlock,
  InlineNode,
  ListBlock,
  TableBlock,
} from "@/src/features/document/ast";

import {
  escapeLatexText,
  escapeLatexUrl,
  renderInlineCode,
  sanitizeCodeBlockUnicode,
} from "./latex-escape";

import type {
  LatexAssetRequest,
  LatexExportOptions,
  LatexFontFamily,
  LatexGenerationResult,
  LatexPaperColor,
  LatexPaperSize,
  LatexTemplateId,
} from "./types";

interface BlockRenderContext {
  numberedHeadings: boolean;
  headingBaseLevel: number;
  headingLevelOffset: 0 | 1;
  isTwoColumn?: boolean;
}

type DocumentLanguage = "en" | "vi";

interface BookLabels {
  contents: string;
  question: string;
  subtitle: string;
  source: string;
  attribution: string;
}

const VIETNAMESE_CHARACTER_PATTERN =
  /[ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬĐÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴàáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/u;

const VIETNAMESE_LISTINGS_CHARACTERS =
  "ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬĐÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴàáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ";

const BOOK_LABELS: Readonly<BookLabels> = {
  contents: "Contents",
  question: "Reader's question",
  subtitle: "A thoughtfully typeset ChatGPT conversation",
  source: "Source",
  attribution: "Exported with Chat2TeX",
};

export class LatexGenerator {
  private assets: LatexAssetRequest[] = [];

  generate(
    document: ChatDocumentAst,
    optionsOrTemplateId: LatexExportOptions | LatexTemplateId = "academic",
  ): LatexGenerationResult {
    const options: LatexExportOptions =
      typeof optionsOrTemplateId === "string"
        ? { templateId: optionsOrTemplateId }
        : optionsOrTemplateId;

    this.assets = [];

    const language = detectDocumentLanguage(document);
    const labels = BOOK_LABELS;

    const templateId = options.templateId ?? "academic";
    const paperColor = options.paperColor ?? "default";
    const fontFamily = options.fontFamily ?? "default";
    const paperSize = options.paperSize ?? "a4";
    const authorName = options.authorName?.trim() || "";
    const authorLabel = authorName
      ? escapeNormalizedText(authorName)
      : escapeNormalizedText(labels.attribution);

    const includeUserMessages = options.includeUserMessages ?? true;
    const excludedSet = new Set(options.excludedMessageIds ?? []);

    const filteredMessages = [...document.messages]
      .sort((first, second) => first.order - second.order)
      .filter((message) => {
        if (excludedSet.has(message.id)) {
          return false;
        }
        if (!includeUserMessages && message.role === "user") {
          return false;
        }
        return true;
      });

    let questionNumber = 0;
    let hasQuestionSection = false;

    const body = filteredMessages
      .map((message) => {
        if (message.role === "user") {
          questionNumber += 1;
          hasQuestionSection = true;
        }

        return this.renderMessage(
          message,
          this.findMessageHeadingBaseLevel(message),
          message.role === "assistant" && hasQuestionSection ? 1 : 0,
          labels,
          questionNumber,
          templateId,
        );
      })
      .join("\n\n");

    const isBookStyle =
      templateId === "editorial-book" || templateId === "classic-serif";

    const headerContent = isBookStyle
      ? [
          this.renderCover(document, labels, authorLabel),
          "",
          this.renderContents(document),
        ].join("\n")
      : this.renderAcademicHeader(document, labels, authorLabel);

    const source = [
      this.renderPreamble(
        language,
        labels,
        templateId,
        paperColor,
        fontFamily,
        paperSize,
        authorLabel,
      ),
      "",
      "\\begin{document}",
      "",
      headerContent,
      "",
      body,
      "",
      "\\end{document}",
      "",
    ].join("\n");

    return {
      source,
      assets: [...this.assets],
    };
  }

  private renderPreamble(
    language: DocumentLanguage,
    labels: BookLabels,
    templateId: LatexTemplateId,
    paperColor: LatexPaperColor = "default",
    fontFamily: LatexFontFamily = "default",
    paperSize: LatexPaperSize = "a4",
    authorLabel?: string,
  ): string {
    const paperSpec =
      paperSize === "letter"
        ? "letterpaper"
        : paperSize === "a5"
          ? "a5paper"
          : "a4paper";

    const docClass =
      templateId === "ieee-twocolumn"
        ? `\\documentclass[10pt,twocolumn,${paperSpec}]{article}`
        : templateId === "cheatsheet"
          ? `\\documentclass[9pt,twocolumn,${paperSpec}]{article}`
          : `\\documentclass[11pt,${paperSpec}]{article}`;

    const geometry =
      templateId === "cheatsheet"
        ? "\\geometry{top=12mm, bottom=12mm, left=12mm, right=12mm}"
        : templateId === "ieee-twocolumn"
          ? "\\geometry{top=18mm, bottom=18mm, left=15mm, right=15mm}"
          : "\\geometry{top=22mm, bottom=22mm, left=22mm, right=22mm, headheight=20pt}";

    const fontOverrides =
      fontFamily === "sans"
        ? ["\\renewcommand{\\familydefault}{\\sfdefault}"]
        : fontFamily === "serif"
          ? ["\\renewcommand{\\familydefault}{\\rmdefault}"]
          : fontFamily === "mono"
            ? ["\\renewcommand{\\familydefault}{\\ttdefault}"]
            : [];

    const isDark = paperColor === "dark" || (paperColor === "default" && templateId === "dark-mode");

    const colors = isDark
      ? [
          "\\definecolor{bookpaper}{HTML}{18181B}",
          "\\definecolor{bookink}{HTML}{F4F4F5}",
          "\\definecolor{bookmuted}{HTML}{A1A1AA}",
          "\\definecolor{bookaccent}{HTML}{38BDF8}",
          "\\definecolor{bookrule}{HTML}{3F3F46}",
          "\\definecolor{questionaccent}{HTML}{38BDF8}",
          "\\definecolor{questionbg}{HTML}{27272A}",
          "\\definecolor{questiontext}{HTML}{38BDF8}",
          "\\definecolor{codebackground}{HTML}{27272A}",
          "\\definecolor{codeforeground}{HTML}{F4F4F5}",
          "\\definecolor{codecomment}{HTML}{4ADE80}",
          "\\definecolor{codekeyword}{HTML}{38BDF8}",
          "\\definecolor{codestring}{HTML}{FACC15}",
          "\\definecolor{codelabel}{HTML}{38BDF8}",
          "\\definecolor{coderule}{HTML}{3F3F46}",
        ]
      : paperColor === "sepia"
        ? [
            "\\definecolor{bookpaper}{HTML}{FBF0D9}",
            "\\definecolor{bookink}{HTML}{2C221E}",
            "\\definecolor{bookmuted}{HTML}{8B7355}",
            "\\definecolor{bookaccent}{HTML}{8B4513}",
            "\\definecolor{bookrule}{HTML}{E7DFD5}",
            "\\definecolor{questionaccent}{HTML}{8B4513}",
            "\\definecolor{questionbg}{HTML}{F5EFE6}",
            "\\definecolor{questiontext}{HTML}{2C221E}",
            "\\definecolor{codebackground}{HTML}{F9F6F0}",
            "\\definecolor{codeforeground}{HTML}{2C221E}",
            "\\definecolor{codecomment}{HTML}{6B8E23}",
            "\\definecolor{codekeyword}{HTML}{8B4513}",
            "\\definecolor{codestring}{HTML}{CD853F}",
            "\\definecolor{codelabel}{HTML}{8B4513}",
            "\\definecolor{coderule}{HTML}{E7DFD5}",
          ]
        : paperColor === "white"
          ? [
              "\\definecolor{bookpaper}{HTML}{FFFFFF}",
              "\\definecolor{bookink}{HTML}{111111}",
              "\\definecolor{bookmuted}{HTML}{555555}",
              "\\definecolor{bookaccent}{HTML}{2B6CB0}",
              "\\definecolor{bookrule}{HTML}{CCCCCC}",
              "\\definecolor{questionaccent}{HTML}{2B6CB0}",
              "\\definecolor{questionbg}{HTML}{F8F9FA}",
              "\\definecolor{questiontext}{HTML}{111111}",
              "\\definecolor{codebackground}{HTML}{F8F9FA}",
              "\\definecolor{codeforeground}{HTML}{111111}",
              "\\definecolor{codecomment}{HTML}{008000}",
              "\\definecolor{codekeyword}{HTML}{0000FF}",
              "\\definecolor{codestring}{HTML}{A31515}",
              "\\definecolor{codelabel}{HTML}{2B6CB0}",
              "\\definecolor{coderule}{HTML}{CCCCCC}",
            ]
          : paperColor === "cream"
            ? [
                "\\definecolor{bookpaper}{HTML}{FCFBF9}",
                "\\definecolor{bookink}{HTML}{1A202C}",
                "\\definecolor{bookmuted}{HTML}{718096}",
                "\\definecolor{bookaccent}{HTML}{2B6CB0}",
                "\\definecolor{bookrule}{HTML}{E2E8F0}",
                "\\definecolor{questionaccent}{HTML}{15803D}",
                "\\definecolor{questionbg}{HTML}{F0FDF4}",
                "\\definecolor{questiontext}{HTML}{166534}",
                "\\definecolor{codebackground}{HTML}{F7FAFC}",
                "\\definecolor{codeforeground}{HTML}{1A202C}",
                "\\definecolor{codecomment}{HTML}{38A169}",
                "\\definecolor{codekeyword}{HTML}{3182CE}",
                "\\definecolor{codestring}{HTML}{DD6B20}",
                "\\definecolor{codelabel}{HTML}{2B6CB0}",
                "\\definecolor{coderule}{HTML}{CBD5E0}",
              ]
            : templateId === "notion-style"
              ? [
                  "\\definecolor{bookpaper}{HTML}{FAFAFA}",
                  "\\definecolor{bookink}{HTML}{18181B}",
                  "\\definecolor{bookmuted}{HTML}{71717A}",
                  "\\definecolor{bookaccent}{HTML}{6366F1}",
                  "\\definecolor{bookrule}{HTML}{E4E4E7}",
                  "\\definecolor{questionaccent}{HTML}{6366F1}",
                  "\\definecolor{questionbg}{HTML}{EEF2FF}",
                  "\\definecolor{questiontext}{HTML}{4338CA}",
                  "\\definecolor{codebackground}{HTML}{F4F4F5}",
                  "\\definecolor{codeforeground}{HTML}{18181B}",
                  "\\definecolor{codecomment}{HTML}{10B981}",
                  "\\definecolor{codekeyword}{HTML}{6366F1}",
                  "\\definecolor{codestring}{HTML}{F59E0B}",
                  "\\definecolor{codelabel}{HTML}{6366F1}",
                  "\\definecolor{coderule}{HTML}{E4E4E7}",
                ]
              : templateId === "executive-report"
                ? [
                    "\\definecolor{bookpaper}{HTML}{FFFFFF}",
                    "\\definecolor{bookink}{HTML}{0F172A}",
                    "\\definecolor{bookmuted}{HTML}{64748B}",
                    "\\definecolor{bookaccent}{HTML}{1E3A8A}",
                    "\\definecolor{bookrule}{HTML}{CBD5E1}",
                    "\\definecolor{questionaccent}{HTML}{1E3A8A}",
                    "\\definecolor{questionbg}{HTML}{F1F5F9}",
                    "\\definecolor{questiontext}{HTML}{1E3A8A}",
                    "\\definecolor{codebackground}{HTML}{F8FAFC}",
                    "\\definecolor{codeforeground}{HTML}{0F172A}",
                    "\\definecolor{codecomment}{HTML}{059669}",
                    "\\definecolor{codekeyword}{HTML}{1D4ED8}",
                    "\\definecolor{codestring}{HTML}{D97706}",
                    "\\definecolor{codelabel}{HTML}{1E3A8A}",
                    "\\definecolor{coderule}{HTML}{CBD5E1}",
                  ]
                : templateId === "academic" || templateId === "ieee-twocolumn"
                  ? [
                      "\\definecolor{bookpaper}{HTML}{FFFFFF}",
                      "\\definecolor{bookink}{HTML}{111111}",
                      "\\definecolor{bookmuted}{HTML}{555555}",
                      "\\definecolor{bookaccent}{HTML}{000000}",
                      "\\definecolor{bookrule}{HTML}{CCCCCC}",
                      "\\definecolor{questionaccent}{HTML}{333333}",
                      "\\definecolor{questionbg}{HTML}{FAFAFA}",
                      "\\definecolor{questiontext}{HTML}{111111}",
                      "\\definecolor{codebackground}{HTML}{F8F9FA}",
                      "\\definecolor{codeforeground}{HTML}{111111}",
                      "\\definecolor{codecomment}{HTML}{008000}",
                      "\\definecolor{codekeyword}{HTML}{0000FF}",
                      "\\definecolor{codestring}{HTML}{A31515}",
                      "\\definecolor{codelabel}{HTML}{333333}",
                      "\\definecolor{coderule}{HTML}{CCCCCC}",
                    ]
                  : [
                      "\\definecolor{bookpaper}{HTML}{FCFBF9}",
                      "\\definecolor{bookink}{HTML}{1A202C}",
                      "\\definecolor{bookmuted}{HTML}{718096}",
                      "\\definecolor{bookaccent}{HTML}{2B6CB0}",
                      "\\definecolor{bookrule}{HTML}{E2E8F0}",
                      "\\definecolor{questionaccent}{HTML}{15803D}",
                      "\\definecolor{questionbg}{HTML}{F0FDF4}",
                      "\\definecolor{questiontext}{HTML}{166534}",
                      "\\definecolor{codebackground}{HTML}{F7FAFC}",
                      "\\definecolor{codeforeground}{HTML}{1A202C}",
                      "\\definecolor{codecomment}{HTML}{38A169}",
                      "\\definecolor{codekeyword}{HTML}{3182CE}",
                      "\\definecolor{codestring}{HTML}{DD6B20}",
                      "\\definecolor{codelabel}{HTML}{2B6CB0}",
                      "\\definecolor{coderule}{HTML}{CBD5E0}",
                    ];

    return [
      docClass,
      "",
      ...this.renderFontConfiguration(language),
      ...fontOverrides,
      "\\usepackage{amsmath}",
      "\\usepackage{amssymb}",
      "\\usepackage{graphicx}",
      "\\usepackage[export]{adjustbox}",
      "\\usepackage{longtable}",
      "\\usepackage{booktabs}",
      "\\usepackage{listings}",
      "\\usepackage{xcolor}",
      "\\usepackage{hyperref}",
      "\\usepackage{enumitem}",
      "\\usepackage[normalem]{ulem}",
      "\\usepackage{geometry}",
      "\\IfFileExists{microtype.sty}{\\usepackage[protrusion=true,final]{microtype}}{}",
      "",
      geometry,
      "",
      ...colors,
      "",
      "\\hypersetup{",
      "  colorlinks=true,",
      "  linkcolor=bookaccent,",
      "  urlcolor=bookaccent,",
      "  citecolor=bookaccent",
      "}",
      "",
      "\\AtBeginDocument{\\pagecolor{bookpaper}\\color{bookink}}",
      "\\setlength{\\parindent}{0pt}",
      "\\setlength{\\parskip}{0.62em}",
      "\\setlength{\\abovedisplayskip}{0.9em}",
      "\\setlength{\\belowdisplayskip}{0.9em}",
      "\\linespread{1.08}",
      "\\raggedbottom",
      "\\clubpenalty=10000",
      "\\widowpenalty=10000",
      "\\displaywidowpenalty=10000",
      "\\emergencystretch=2em",
      "\\setcounter{tocdepth}{2}",
      "\\setcounter{secnumdepth}{3}",
      `\\renewcommand{\\contentsname}{${escapeNormalizedText(
        labels.contents,
      )}}`,
      "\\setlist{itemsep=0.25em, topsep=0.45em, parsep=0pt}",
      "",
      "\\newenvironment{readerquestion}[1]{",
      "  \\par\\vspace{1em}",
      "  \\noindent\\colorbox{questionbg}{%",
      "    \\begin{minipage}{\\dimexpr\\linewidth-2\\fboxsep}",
      "      \\vspace{0.45em}",
      "      \\noindent\\textcolor{questionaccent}{\\rule{28mm}{1.0pt}}",
      "      \\par\\vspace{0.25em}",
      "      {\\sffamily\\small\\bfseries\\color{questionaccent} #1}",
      "      \\par\\vspace{0.3em}",
      "      \\color{questiontext}\\itshape",
      "}{",
      "      \\vspace{0.45em}",
      "    \\end{minipage}%",
      "  }",
      "  \\par\\vspace{0.9em}",
      "}",
      "",
      "\\newenvironment{chattexiconrow}{%",
      "  \\par\\smallskip\\begingroup\\centering\\noindent%",
      "}{%",
      "  \\par\\endgroup\\smallskip%",
      "}",
      "",
      "\\makeatletter",
      "\\newcommand{\\chatbooktitle}{}",
      "\\newcommand{\\setchatbooktitle}[1]{\\renewcommand{\\chatbooktitle}{#1}}",
      "\\newcommand{\\chatquestionsection}[1]{%",
      "  \\refstepcounter{section}%",
      "  \\addcontentsline{toc}{section}{\\protect\\numberline{\\thesection}#1}%",
      "  \\markright{#1}%",
      "}",
      "\\renewcommand{\\sectionmark}[1]{\\markright{#1}}",
      "\\def\\ps@chatbook{",
      "  \\def\\@oddhead{%",
      "    \\vbox{%",
      "      \\hbox to\\textwidth{%",
      "        \\parbox[b]{0.46\\textwidth}{\\raggedright\\sffamily\\scriptsize\\color{bookmuted}\\chatbooktitle}%",
      "        \\hfill%",
      "        \\parbox[b]{0.46\\textwidth}{\\raggedleft\\sffamily\\scriptsize\\color{bookmuted}\\rightmark}%",
      "      }%",
      "      \\vskip 4pt%",
      "      \\hbox{\\textcolor{bookrule}{\\rule{\\textwidth}{0.4pt}}}%",
      "    }%",
      "  }",
      "  \\def\\@evenhead{\\@oddhead}",
      "  \\def\\@oddfoot{%",
      "    \\sffamily\\scriptsize\\color{bookmuted}Chat2TeX%",
      "    \\hfill\\thepage%",
      "  }",
      "  \\def\\@evenfoot{\\@oddfoot}",
      "}",
      "\\renewcommand\\section{\\@startsection{section}{1}{\\z@}%",
      "  {-3.2ex \\@plus -1ex \\@minus -.2ex}%",
      "  {1.4ex \\@plus .2ex}%",
      "  {\\normalfont\\sffamily\\LARGE\\bfseries\\color{bookink}}}",
      "\\renewcommand\\subsection{\\@startsection{subsection}{2}{\\z@}%",
      "  {-2.8ex \\@plus -1ex \\@minus -.2ex}%",
      "  {1ex \\@plus .2ex}%",
      "  {\\normalfont\\sffamily\\Large\\bfseries\\color{bookaccent}}}",
      "\\renewcommand\\subsubsection{\\@startsection{subsubsection}{3}{\\z@}%",
      "  {-2.3ex \\@plus -1ex \\@minus -.2ex}%",
      "  {.8ex \\@plus .2ex}%",
      "  {\\normalfont\\sffamily\\normalsize\\bfseries\\color{bookaccent}}}",
      "\\makeatother",
      "",
      "\\providecommand{\\chatcodenumber}[1]{#1}",
      "\\newlength{\\maxwidth}\\setlength{\\maxwidth}{\\linewidth}",
      "\\newlength{\\maxheight}\\setlength{\\maxheight}{0.68\\textheight}",
      "",
      "\\lstdefinelanguage{ChatJavaScript}{",
      "  sensitive=true,",
      "  morekeywords={break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,from,function,get,if,import,in,instanceof,let,new,of,return,set,static,super,switch,this,throw,try,typeof,var,void,while,with,yield,async,await},",
      "  morecomment=[l]{//},",
      "  morecomment=[s]{/*}{*/},",
      '  morestring=[b]",',
      "  morestring=[b]'",
      "}",
      "",
      "\\lstdefinelanguage{ChatCSS}{",
      "  sensitive=true,",
      "  alsoletter={-},",
      "  morekeywords={align-items,background,background-color,border,border-radius,bottom,box-shadow,color,display,flex,flex-direction,font-family,font-size,font-weight,gap,grid,grid-template-columns,height,justify-content,left,line-height,margin,margin-bottom,margin-left,margin-right,margin-top,max-height,max-width,min-height,min-width,opacity,overflow,padding,padding-bottom,padding-left,padding-right,padding-top,position,right,text-align,text-decoration,top,transform,transition,width,z-index},",
      "  morecomment=[s]{/*}{*/},",
      '  morestring=[b]",',
      "  morestring=[b]'",
      "}",
      "",
      "\\lstdefinelanguage{ChatHTML}{",
      "  sensitive=false,",
      "  morekeywords={html,head,body,main,header,footer,nav,section,article,aside,div,span,picture,img,a,p,h1,h2,h3,h4,h5,h6,ul,ol,li,table,thead,tbody,tr,th,td,form,label,input,button,script,style,link,meta,title,template,slot,canvas,svg,path,class,id,href,src,alt,type,name,value,role,aria-label,data-testid},",
      "  morecomment=[s]{<!--}{-->},",
      '  morestring=[b]",',
      "  morestring=[b]'",
      "}",
      "",
      "\\lstdefinelanguage{ChatTypeScript}{",
      "  sensitive=true,",
      "  morekeywords={break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,from,function,get,if,import,in,instanceof,let,new,of,return,set,static,super,switch,this,throw,try,typeof,var,void,while,with,yield,async,await,interface,type,implements,readonly,public,private,protected,enum,namespace,declare,abstract,unknown,never,keyof,infer,as,satisfies},",
      "  morecomment=[l]{//},",
      "  morecomment=[s]{/*}{*/},",
      '  morestring=[b]",',
      "  morestring=[b]'",
      "}",
      "",
      "\\lstset{",
      "  basicstyle=\\ttfamily\\footnotesize\\color{codeforeground},",
      "  identifierstyle=\\color{codeforeground},",
      "  keywordstyle=\\bfseries\\color{codekeyword},",
      "  commentstyle=\\itshape\\color{codecomment},",
      "  stringstyle=\\color{codestring},",
      "  numbers=left,",
      "  numberstyle=\\tiny\\color{bookmuted},",
      "  numbersep=10pt,",
      "  stepnumber=1,",
      "  breaklines=true,",
      "  breakatwhitespace=false,",
      "  columns=fullflexible,",
      "  keepspaces=true,",
      "  showstringspaces=false,",
      "  frame=tlbr,",
      "  framerule=0.35pt,",
      "  rulecolor=\\color{coderule},",
      "  backgroundcolor=\\color{codebackground},",
      "  xleftmargin=3.0em,",
      "  framexleftmargin=2.5em,",
      "  xrightmargin=0.5em,",
      "  framexrightmargin=0.5em,",
      "  postbreak=\\mbox{\\textcolor{bookmuted}{$\\hookrightarrow$}\\space},",
      `  literate=${renderVietnameseListingsMappings()},`,
      "  aboveskip=1.0em,",
      "  belowskip=1.0em",
      "}",
    ].join("\n");
  }

  private renderFontConfiguration(language: DocumentLanguage): string[] {
    return [
      "\\usepackage{iftex}",
      "\\ifXeTeX",
      "  \\usepackage{fontspec}",
      "  \\setmainfont{Latin Modern Roman}",
      "  \\setsansfont{Latin Modern Sans}",
      "  \\setmonofont{Latin Modern Mono}",
      ...(language === "vi"
        ? [
            "  \\IfFileExists{polyglossia.sty}{",
            "    \\usepackage{polyglossia}",
            "    \\setdefaultlanguage{vietnamese}",
            "  }{}",
          ]
        : []),
      "\\else\\ifLuaTeX",
      "  \\usepackage{fontspec}",
      "  \\setmainfont{Latin Modern Roman}",
      "  \\setsansfont{Latin Modern Sans}",
      "  \\setmonofont{Latin Modern Mono}",
      ...(language === "vi"
        ? [
            "  \\IfFileExists{polyglossia.sty}{",
            "    \\usepackage{polyglossia}",
            "    \\setdefaultlanguage{vietnamese}",
            "  }{}",
          ]
        : []),
      "\\else",
      "  \\usepackage[utf8]{inputenc}",
      "  \\usepackage[T1]{fontenc}",
      "  \\usepackage{lmodern}",
      ...(language === "vi"
        ? ["  \\IfFileExists{vietnam.sty}{\\usepackage{vietnam}}{}"]
        : []),
      "\\fi\\fi",
    ];
  }

  private renderAcademicHeader(
    document: ChatDocumentAst,
    labels: BookLabels,
    authorLabel?: string,
  ): string {
    const title = escapeNormalizedText(
      document.title || "Untitled conversation",
    );
    const sourceUrl = escapeLatexUrl(document.url);
    const author = authorLabel || escapeNormalizedText(labels.attribution);

    return [
      `\\title{\\Large\\bfseries ${title}}`,
      `\\author{\\small ${author}}`,
      "\\date{\\small \\today}",
      "\\maketitle",
      "\\thispagestyle{plain}",
      "\\vspace{-1em}",
      "{\\centerline{\\footnotesize\\color{bookmuted}" +
        `${escapeNormalizedText(labels.source)}: \\url{${sourceUrl}}}}`,
      "\\vspace{1.5em}",
      "\\hrule",
      "\\vspace{1.5em}",
    ].join("\n");
  }

  private renderCover(
    document: ChatDocumentAst,
    labels: BookLabels,
    authorLabel?: string,
  ): string {
    const title = escapeNormalizedText(
      document.title || "Untitled conversation",
    );

    const sourceUrl = escapeLatexUrl(document.url);
    const author = authorLabel || escapeNormalizedText(labels.attribution);

    return [
      "\\begin{titlepage}",
      "\\thispagestyle{empty}",
      "\\vspace*{\\fill}",
      "\\noindent\\textcolor{bookaccent}{\\rule{42mm}{1.4pt}}",
      "\\par\\vspace{7mm}",
      "{\\sffamily\\small\\bfseries\\MakeUppercase{Chat2TeX Edition}}",
      "\\par\\vspace{5mm}",
      `{\\Huge\\bfseries ${title}\\par}`,
      "\\vspace{5mm}",
      `{\\Large\\color{bookmuted}${escapeNormalizedText(
        labels.subtitle,
      )}\\par}`,
      "\\vfill",
      "\\noindent\\textcolor{bookrule}{\\rule{\\linewidth}{0.4pt}}",
      "\\par\\vspace{3mm}",
      "{\\sffamily\\footnotesize\\color{bookmuted}",
      `${escapeNormalizedText(labels.source)}: \\url{${sourceUrl}}`,
      `\\par ${author}}`,
      "\\end{titlepage}",
    ].join("\n");
  }

  private renderContents(document: ChatDocumentAst): string {
    const title = escapeNormalizedText(
      document.title || "Untitled conversation",
    );

    return [
      "\\clearpage",
      "\\pagenumbering{roman}",
      "\\pagestyle{plain}",
      "\\tableofcontents",
      "\\clearpage",
      "\\pagenumbering{arabic}",
      `\\setchatbooktitle{${title}}`,
      "\\markright{}",
      "\\pagestyle{chatbook}",
    ].join("\n");
  }

  private findMessageHeadingBaseLevel(message: ChatMessageAst): number {
    let minimumLevel: number | null = null;

    for (const block of message.blocks) {
      const level = this.findMinimumHeadingLevel(block);

      if (level !== null) {
        minimumLevel =
          minimumLevel === null ? level : Math.min(minimumLevel, level);
      }
    }

    return minimumLevel ?? 1;
  }

  private findMinimumHeadingLevel(block: BlockNode): number | null {
    if (block.type === "heading") {
      return block.level;
    }

    const nestedBlocks =
      block.type === "quote"
        ? block.blocks
        : block.type === "list"
          ? block.items.flatMap((item) => item.blocks)
          : [];

    let minimumLevel: number | null = null;

    for (const nestedBlock of nestedBlocks) {
      const level = this.findMinimumHeadingLevel(nestedBlock);

      if (level !== null) {
        minimumLevel =
          minimumLevel === null ? level : Math.min(minimumLevel, level);
      }
    }

    return minimumLevel;
  }

  private renderMessage(
    message: ChatMessageAst,
    headingBaseLevel: number,
    headingLevelOffset: 0 | 1,
    labels: BookLabels,
    questionNumber: number,
    templateId: LatexTemplateId,
  ): string {
    const isTwoColumn =
      templateId === "ieee-twocolumn" || templateId === "cheatsheet";

    const context: BlockRenderContext = {
      numberedHeadings: message.role === "assistant",
      headingBaseLevel,
      headingLevelOffset,
      isTwoColumn,
    };

    const content = this.renderBlocks(message.blocks, context);

    const renderedContent = content || "\\emph{Empty message}";

    if (message.role === "user") {
      const questionTitle = escapeNormalizedText(
        this.createQuestionTitle(message, questionNumber),
      );
      const questionLabel = escapeNormalizedText(
        `${labels.question} ${questionNumber}`,
      );

      return [
        `\\chatquestionsection{${questionTitle}}`,
        `\\begin{readerquestion}{${questionLabel}}`,
        renderedContent,
        "\\end{readerquestion}",
      ].join("\n");
    }

    return [renderedContent, "\\par\\bigskip"].join("\n");
  }

  private createQuestionTitle(
    message: ChatMessageAst,
    questionNumber: number,
  ): string {
    const questionText = message.blocks
      .map((block) => this.renderRawBlockText(block))
      .join(" ");
    const conciseTitle = truncateAtWordBoundary(questionText, 80);

    if (conciseTitle) {
      return conciseTitle;
    }

    return `Question ${questionNumber}`;
  }

  private renderRawBlockText(block: BlockNode): string {
    switch (block.type) {
      case "paragraph":
      case "heading":
        return this.renderRawInlineNodes(block.children);

      case "code":
        return block.code;

      case "list":
        return block.items
          .flatMap((item) =>
            item.blocks.map((child) => this.renderRawBlockText(child)),
          )
          .join(" ");

      case "quote":
        return block.blocks
          .map((child) => this.renderRawBlockText(child))
          .join(" ");

      case "table":
        return block.rows
          .flatMap((row) =>
            row.cells.map((cell) =>
              this.renderRawInlineNodes(cell.children),
            ),
          )
          .join(" ");

      case "math":
        return block.latex;

      case "image":
        return block.alt;

      case "horizontal-rule":
        return "";
    }
  }

  private renderRawInlineNodes(nodes: InlineNode[]): string {
    return nodes.map((node) => this.renderRawInlineNode(node)).join("");
  }

  private renderRawInlineNode(node: InlineNode): string {
    switch (node.type) {
      case "text":
      case "inline-code":
        return node.value;

      case "strong":
      case "emphasis":
      case "strike":
        return this.renderRawInlineNodes(node.children);

      case "link":
        return this.renderRawInlineNodes(node.children) || node.href;

      case "inline-math":
        return node.latex;

      case "inline-image":
        return node.alt || "image";

      case "line-break":
        return " ";
    }
  }

  private renderBlock(
    block: BlockNode,
    context: BlockRenderContext,
  ): string {
    switch (block.type) {
      case "paragraph":
        return this.renderInlineNodes(block.children);

      case "heading":
        return this.renderHeading(block.level, block.children, context);

      case "code":
        return this.renderCodeBlock(block.language, block.code);

      case "list":
        return this.renderList(block, context);

      case "quote":
        return [
          "\\begin{quote}",
          "\\color{bookmuted}\\itshape",
          "\\noindent\\textcolor{bookaccent}{\\rule{18mm}{0.8pt}}",
          "\\par\\smallskip",
          this.renderBlocks(block.blocks, context),
          "\\end{quote}",
        ].join("\n");

      case "table":
        return this.renderTable(block, context);

      case "math":
        return ["\\[", block.latex.trim(), "\\]"].join("\n");

      case "image":
        return block.presentation === "icon"
          ? this.renderIconRow([block])
          : this.renderBlockImage(block.src, block.alt);

      case "horizontal-rule":
        return [
          "\\par\\medskip",
          "\\begin{center}",
          "\\textcolor{bookaccent}{\\rule{36mm}{0.8pt}}",
          "\\end{center}",
          "\\medskip",
        ].join("\n");
    }
  }

  private renderBlocks(
    blocks: BlockNode[],
    context: BlockRenderContext,
  ): string {
    const renderedBlocks: string[] = [];
    let pendingIcons: ImageBlock[] = [];

    const flushIcons = (): void => {
      if (pendingIcons.length === 0) {
        return;
      }

      renderedBlocks.push(this.renderIconRow(pendingIcons));
      pendingIcons = [];
    };

    for (const block of blocks) {
      if (block.type === "image" && block.presentation === "icon") {
        pendingIcons.push(block);
        continue;
      }

      flushIcons();

      const renderedBlock = this.renderBlock(block, context);

      if (renderedBlock) {
        renderedBlocks.push(renderedBlock);
      }
    }

    flushIcons();

    return renderedBlocks.join("\n\n");
  }

  private renderHeading(
    level: number,
    children: InlineNode[],
    context: BlockRenderContext,
  ): string {
    const content = this.renderHeadingInlineNodes(children);
    const plainContent = this.renderPlainInlineNodes(children);

    const commands: Readonly<Record<number, string>> = {
      1: "section",
      2: "subsection",
      3: "subsubsection",
      4: "paragraph",
      5: "subparagraph",
    };

    const normalizedLevel = context.numberedHeadings
      ? Math.max(1, level - context.headingBaseLevel + 1) +
        context.headingLevelOffset
      : level;

    const command = commands[normalizedLevel];

    if (!command) {
      return `\\textbf{${content}}`;
    }

    const canBeNumbered =
      context.numberedHeadings && normalizedLevel <= 3;

    return canBeNumbered
      ? `\\${command}[${plainContent}]{${content}}`
      : `\\${command}*{${content}}`;
  }

  private renderHeadingInlineNodes(nodes: InlineNode[]): string {
    return nodes.map((node) => this.renderHeadingInlineNode(node)).join("");
  }

  private renderHeadingInlineNode(node: InlineNode): string {
    switch (node.type) {
      case "text":
        return escapeNormalizedText(node.value);

      case "strong":
      case "strike":
        return this.renderHeadingInlineNodes(node.children);

      case "emphasis":
        return [
          "\\emph{",
          this.renderHeadingInlineNodes(node.children),
          "}",
        ].join("");

      case "inline-code":
        return `\\texttt{${escapeNormalizedText(node.value)}}`;

      case "link":
        return (
          this.renderHeadingInlineNodes(node.children) ||
          escapeNormalizedText(node.href)
        );

      case "inline-math":
        return `$${node.latex.trim()}$`;

      case "inline-image":
        return escapeNormalizedText(node.alt || "image");

      case "line-break":
        return " ";
    }
  }

  private renderCodeBlock(language: string | null, code: string): string {
    const detectedLanguage =
      language?.trim().toLowerCase() || inferCodeLanguage(code);
    const listingLanguage = mapListingLanguage(detectedLanguage);
    const displayLanguage = readDisplayLanguage(
      detectedLanguage,
      listingLanguage,
    );

    const options = listingLanguage ? `[language=${listingLanguage}]` : "";
    const languageLabel = displayLanguage
      ? `{\\sffamily\\scriptsize\\bfseries\\color{codelabel}\\MakeUppercase{${escapeNormalizedText(
          displayLanguage,
        )}}\\par}`
      : "";

    const safeCode = sanitizeCodeBlockUnicode(
      code
        .normalize("NFC")
        .replace(/\\end\{lstlisting\}/g, "\\end {lstlisting}"),
    );

    return [
      languageLabel,
      `\\begin{lstlisting}${options}`,
      safeCode,
      "\\end{lstlisting}",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private renderList(
    block: ListBlock,
    context: BlockRenderContext,
  ): string {
    const environment = block.ordered ? "enumerate" : "itemize";

    const startOption =
      block.ordered && block.start !== null && block.start !== 1
        ? `[start=${block.start}]`
        : "";

    const items = block.items
      .map((item) => {
        const itemContent = this.renderBlocks(item.blocks, context);

        return ["\\item", itemContent].join(" ");
      })
      .join("\n");

    return [
      `\\begin{${environment}}${startOption}`,
      items,
      `\\end{${environment}}`,
    ].join("\n");
  }

  private renderTable(block: TableBlock, context?: BlockRenderContext): string {
    if (block.rows.length === 0) {
      return "";
    }

    const columnCount = Math.max(
      ...block.rows.map((row) => row.cells.length),
      1,
    );

    const renderedRows = block.rows.map((row) => {
      const cells = Array.from({ length: columnCount }, (_, columnIndex) => {
        const cell = row.cells[columnIndex];

        if (!cell) {
          return "";
        }

        const content = this.renderInlineNodes(cell.children);

        return cell.header ? `\\textbf{${content}}` : content;
      });

      return `${cells.join(" & ")} \\\\`;
    });

    const firstRow = block.rows[0];

    const hasHeader =
      firstRow.cells.length > 0 &&
      firstRow.cells.every((cell) => cell.header);

    const header = hasHeader ? renderedRows[0] : null;

    const bodyRows = hasHeader ? renderedRows.slice(1) : renderedRows;

    if (context?.isTwoColumn) {
      const colSpec = "l".repeat(columnCount);
      return [
        "\\begin{center}",
        "\\begin{adjustbox}{max width=\\linewidth}",
        `\\begin{tabular}{${colSpec}}`,
        "\\toprule",
        ...(header ? [header, "\\midrule"] : []),
        ...bodyRows,
        "\\bottomrule",
        "\\end{tabular}",
        "\\end{adjustbox}",
        "\\end{center}",
      ].join("\n");
    }

    const columnWidth =
      `p{\\dimexpr(\\linewidth-${columnCount * 2}\\tabcolsep)` +
      `/${columnCount}\\relax}`;

    const columnDefinition = columnWidth.repeat(columnCount);

    return [
      `\\begin{longtable}{${columnDefinition}}`,
      "\\toprule",
      ...(header
        ? [
            header,
            "\\midrule",
            "\\endfirsthead",
            "\\toprule",
            header,
            "\\midrule",
            "\\endhead",
          ]
        : []),
      ...bodyRows,
      "\\bottomrule",
      "\\end{longtable}",
    ].join("\n");
  }

  private renderInlineNodes(nodes: InlineNode[]): string {
    return nodes.map((node) => this.renderInlineNode(node)).join("");
  }

  private renderPlainInlineNodes(nodes: InlineNode[]): string {
    return nodes.map((node) => this.renderPlainInlineNode(node)).join("");
  }

  private renderPlainInlineNode(node: InlineNode): string {
    switch (node.type) {
      case "text":
        return escapeNormalizedText(node.value);

      case "strong":
      case "emphasis":
      case "strike":
        return this.renderPlainInlineNodes(node.children);

      case "inline-code":
        return escapeNormalizedText(node.value);

      case "link":
        return (
          this.renderPlainInlineNodes(node.children) ||
          escapeNormalizedText(node.href)
        );

      case "inline-math":
        return escapeNormalizedText(node.latex);

      case "inline-image":
        return escapeNormalizedText(node.alt || "image");

      case "line-break":
        return " ";
    }
  }

  private renderInlineNode(node: InlineNode): string {
    switch (node.type) {
      case "text":
        return escapeNormalizedText(node.value);

      case "strong":
        return ["\\textbf{", this.renderInlineNodes(node.children), "}"].join(
          "",
        );

      case "emphasis":
        return ["\\emph{", this.renderInlineNodes(node.children), "}"].join("");

      case "strike":
        return ["\\sout{", this.renderInlineNodes(node.children), "}"].join("");

      case "inline-code":
        return renderInlineCode(node.value);

      case "link":
        return [
          "\\href{",
          escapeLatexUrl(node.href),
          "}{",
          this.renderInlineNodes(node.children) ||
            escapeNormalizedText(node.href),
          "}",
        ].join("");

      case "inline-math":
        return `$${node.latex.trim()}$`;

      case "inline-image":
        return this.renderInlineImage(node.src, node.alt);

      case "line-break":
        return "\\\\\n";
    }
  }

  private renderBlockImage(sourceUrl: string, alt: string): string {
    const asset = this.registerImage(sourceUrl, alt);

    const safeAlt = escapeNormalizedText(
      alt.trim() || "Image unavailable",
    );
    const caption = alt.trim()
      ? `{\\small\\itshape\\color{bookmuted}${escapeNormalizedText(
          alt.trim(),
        )}\\par}`
      : "";

    return [
      "\\begin{center}",
      `\\IfFileExists{${asset.outputPath}}{`,
      "  \\includegraphics[",
      "    width=\\maxwidth,",
      "    height=\\maxheight,",
      "    keepaspectratio",
      `  ]{${asset.outputPath}}`,
      caption ? "  \\par\\smallskip" : "",
      caption ? `  ${caption}` : "",
      "}{",
      "  \\fbox{",
      "    \\parbox{0.65\\linewidth}{",
      `      ${safeAlt}`,
      "    }",
      "  }",
      "}",
      "\\end{center}",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private renderIconRow(images: ImageBlock[]): string {
    const icons = images.map((image) => {
      const asset = this.registerImage(image.src, image.alt);

      return [
        `\\IfFileExists{${asset.outputPath}}{`,
        "  \\includegraphics[",
        "    max width=1.4em,",
        "    max height=1.4em,",
        "    keepaspectratio",
        `  ]{${asset.outputPath}}`,
        "}{",
        "  \\texttt{[icon unavailable]}",
        "}",
      ].join("\n");
    });

    return [
      "\\begin{chattexiconrow}",
      icons.join("\\hspace{0.55em plus 0.2em}\\allowbreak\n"),
      "\\end{chattexiconrow}",
    ].join("\n");
  }

  private renderInlineImage(sourceUrl: string, alt: string): string {
    const asset = this.registerImage(sourceUrl, alt);

    return [
      `\\IfFileExists{${asset.outputPath}}{`,
      "  \\raisebox{-0.2em}{",
      "    \\includegraphics[",
      "      height=1.2em,",
      "      keepaspectratio",
      `    ]{${asset.outputPath}}`,
      "  }",
      "}{",
      `  \\texttt{[${escapeNormalizedText(alt || "image")}]}`,
      "}",
    ].join("\n");
  }

  private registerImage(sourceUrl: string, alt: string): LatexAssetRequest {
    const existingAsset = this.assets.find(
      (asset) => asset.sourceUrl === sourceUrl,
    );

    if (existingAsset) {
      return existingAsset;
    }

    const id = ["image-", String(this.assets.length + 1).padStart(3, "0")].join(
      "",
    );

    const asset: LatexAssetRequest = {
      id,
      kind: "image",
      sourceUrl,
      outputPath: `assets/${id}.png`,
      alt,
    };

    this.assets.push(asset);

    return asset;
  }
}

function mapListingLanguage(language: string | null): string | null {
  if (!language) {
    return null;
  }

  const normalized = language.toLowerCase().trim();

  const languageMap: Readonly<Record<string, string>> = {
    js: "ChatJavaScript",
    javascript: "ChatJavaScript",
    jsx: "ChatJavaScript",

    ts: "ChatTypeScript",
    typescript: "ChatTypeScript",
    tsx: "ChatTypeScript",

    py: "Python",
    python: "Python",

    sh: "bash",
    shell: "bash",
    bash: "bash",

    css: "ChatCSS",
    json: "ChatJavaScript",
    sql: "SQL",
    java: "Java",
    c: "C",
    cpp: "C++",
    "c++": "C++",
    html: "ChatHTML",
    xml: "ChatHTML",
  };

  return languageMap[normalized] ?? null;
}

function readDisplayLanguage(
  language: string | null,
  listingLanguage: string | null,
): string {
  if (!language) {
    return listingLanguage ?? "";
  }

  const displayNames: Readonly<Record<string, string>> = {
    bash: "Bash",
    cpp: "C++",
    css: "CSS",
    html: "HTML",
    javascript: "JavaScript",
    js: "JavaScript",
    json: "JSON",
    jsx: "JavaScript",
    py: "Python",
    python: "Python",
    sh: "Shell",
    shell: "Shell",
    sql: "SQL",
    ts: "TypeScript",
    tsx: "TypeScript",
    typescript: "TypeScript",
    xml: "XML",
  };

  return displayNames[language] ?? listingLanguage ?? language;
}

function inferCodeLanguage(code: string): string | null {
  const normalized = code.normalize("NFC").trim();

  if (!normalized) {
    return null;
  }

  if (looksLikeJson(normalized)) {
    return "json";
  }

  if (/^<(!doctype\s+html|[a-z][\w:-]*(?:\s|>|\/>))/iu.test(normalized)) {
    return "html";
  }

  if (
    /^#!.*\b(?:ba|z|k)?sh\b/mu.test(normalized) ||
    /^(?:cd|curl|docker|echo|export|git|ls|mkdir|npm|pnpm|rm|sudo|yarn)\b/mu.test(
      normalized,
    )
  ) {
    return "bash";
  }

  if (
    /^(?:def|class)\s+[A-Za-z_]\w*.*:\s*$/mu.test(normalized) ||
    /^(?:from\s+\S+\s+import|import\s+[A-Za-z_][\w.]*)\b/mu.test(normalized)
  ) {
    return "python";
  }

  if (
    /^(?:select|insert|update|delete|create|alter|drop|with)\b/iu.test(
      normalized,
    )
  ) {
    return "sql";
  }

  if (
    /^[^{]+\{[\s\S]*[\w-]+\s*:\s*[^;{}]+;?[\s\S]*\}$/u.test(normalized)
  ) {
    return "css";
  }

  if (
    /\b(?:interface|type|enum|namespace|implements|readonly|satisfies)\b/u.test(
      normalized,
    ) ||
    /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*:\s*[A-Za-z_$][\w$<>{}[\]|&., ]*/u.test(
      normalized,
    ) ||
    /\([^)]*:\s*[A-Za-z_$][\w$<>{}[\]|&., ]*[^)]*\)\s*(?::\s*[^=]+)?=>/u.test(
      normalized,
    )
  ) {
    return "typescript";
  }

  if (
    /\b(?:import|export|const|let|var|function)\b/u.test(normalized) ||
    /=>/u.test(normalized)
  ) {
    return "javascript";
  }

  return null;
}

function looksLikeJson(value: string): boolean {
  if (
    !(
      (value.startsWith("{") && value.endsWith("}")) ||
      (value.startsWith("[") && value.endsWith("]"))
    )
  ) {
    return false;
  }

  try {
    JSON.parse(value);

    return true;
  } catch {
    return false;
  }
}

function detectDocumentLanguage(
  document: ChatDocumentAst,
): DocumentLanguage {
  return VIETNAMESE_CHARACTER_PATTERN.test(
    JSON.stringify(document).normalize("NFC"),
  )
    ? "vi"
    : "en";
}

function escapeNormalizedText(value: string): string {
  return escapeLatexText(value.normalize("NFC"));
}

function renderVietnameseListingsMappings(): string {
  return Array.from(VIETNAMESE_LISTINGS_CHARACTERS)
    .map((character) => `{${character}}{{${character}}}1`)
    .join(" ");
}

export function truncateAtWordBoundary(value: string, limit: number): string {
  const normalized = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  const characters = Array.from(normalized);

  if (characters.length <= limit) {
    return normalized;
  }

  const prefix = characters.slice(0, limit - 1).join("");
  const wordBoundary = prefix.lastIndexOf(" ");
  const truncated =
    wordBoundary >= Math.floor(limit * 0.55)
      ? prefix.slice(0, wordBoundary)
      : prefix;

  return `${truncated.trim()}…`;
}
