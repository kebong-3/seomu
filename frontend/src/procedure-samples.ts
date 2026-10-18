import type { Procedure } from "./procedures";
const travelText = `가상 푸른시 출장 정산 연습 지침 · 실제 규정 아님
제1조 출장자는 출장명령서와 출장결과보고서를 준비한다.
제2조 개인 교통수단을 이용한 경우 교통비 영수증을 준비하여 교통비를 검토한다.
제3조 공용차를 이용한 경우 교통비를 중복 청구하지 않도록 차량 이용내역을 확인한다.
제4조 식사를 제공받은 경우 제공 내역을 정산서에 표시하고 식비 조정 여부를 확인한다. 식사를 제공받지 않은 경우 해당 항목의 기관 기준을 확인한다.
제5조 정산서와 증빙목록은 출장 종료 후 5일 이내에 담당자에게 제출한다. 이 기한은 가상 연습용이다.`;
export const travelProcedure: Procedure = {
  id: "synthetic-travel-v2",
  title: "출장 정산 · 가상 연습",
  keywords: "출장 정산 여비 공용차 식사 증빙",
  institution: "가상 푸른시",
  source: "합성 출장 지침 · 실제 규정 아님",
  version: "연습 v1",
  text: travelText,
  questions: [
    {
      id: "vehicle",
      label: "어떤 교통수단을 이용했나요?",
      quote:
        "공용차를 이용한 경우 교통비를 중복 청구하지 않도록 차량 이용내역을 확인한다.",
      options: [
        {
          value: "public_car",
          label: "공용차 이용",
          phrases: [
            "공용차를 탔",
            "공용차를 이용했",
            "공용차로 다녀왔",
            "관용차를 이용했",
          ],
        },
        {
          value: "personal",
          label: "개인 교통수단 이용",
          phrases: ["개인차를 이용했", "기차를 탔", "버스를 탔", "택시를 탔"],
        },
      ],
    },
    {
      id: "meal",
      label: "식사를 제공받았나요?",
      quote:
        "식사를 제공받은 경우 제공 내역을 정산서에 표시하고 식비 조정 여부를 확인한다.",
      options: [
        {
          value: "provided",
          label: "식사 제공받음",
          phrases: ["점심을 제공받았", "식사를 제공받았", "식사 제공받음"],
        },
        {
          value: "not_provided",
          label: "식사 제공받지 않음",
          phrases: [
            "식사를 제공받지 않았",
            "점심을 제공받지 않았",
            "식사 제공받지 않음",
          ],
        },
      ],
    },
  ],
  steps: [
    {
      action: "출장명령서·출장결과보고서 준비",
      deadline: "",
      form: "출장명령서·출장결과보고서",
      quote: "출장자는 출장명령서와 출장결과보고서를 준비한다.",
    },
    {
      action: "교통비 영수증으로 교통비 검토",
      deadline: "",
      form: "교통비 영수증",
      quote:
        "개인 교통수단을 이용한 경우 교통비 영수증을 준비하여 교통비를 검토한다.",
      condition: { questionId: "vehicle", value: "personal" },
    },
    {
      action: "차량 이용내역으로 교통비 중복 청구 확인",
      deadline: "",
      form: "차량 이용내역",
      quote:
        "공용차를 이용한 경우 교통비를 중복 청구하지 않도록 차량 이용내역을 확인한다.",
      condition: { questionId: "vehicle", value: "public_car" },
    },
    {
      action: "제공받은 식사를 표시하고 식비 조정 여부 확인",
      deadline: "",
      form: "정산서",
      quote:
        "식사를 제공받은 경우 제공 내역을 정산서에 표시하고 식비 조정 여부를 확인한다.",
      condition: { questionId: "meal", value: "provided" },
    },
    {
      action: "식비 항목의 기관 기준 확인",
      deadline: "",
      form: "정산서",
      quote: "식사를 제공받지 않은 경우 해당 항목의 기관 기준을 확인한다.",
      condition: { questionId: "meal", value: "not_provided" },
    },
    {
      action: "정산서와 증빙목록을 담당자에게 제출",
      deadline: "출장 종료 후 5일 이내",
      form: "정산서·증빙목록",
      quote:
        "정산서와 증빙목록은 출장 종료 후 5일 이내에 담당자에게 제출한다. 이 기한은 가상 연습용이다.",
    },
  ],
};
const purchaseText = `가상 푸른시 물품 구매 연습 지침 · 실제 규정 아님
제1조 구매를 시작하기 전에는 견적서와 구매요구서를 준비하여 예산 및 구매 승인을 확인한다.
제2조 납품을 받았으나 검수 전인 경우 납품서와 물품을 대조하여 검수조서를 작성한다. 하자나 수량 차이는 보완을 요청한다.
제3조 검수를 마친 뒤 지급 전인 경우 검수조서와 청구서 및 세금계산서를 대조하고 지급 서류를 준비한다.
제4조 모든 단계에서 현재 단계의 서류 누락과 기관별 결재선을 확인한다. 기한과 계약 방식은 담당 부서에 확인한다.`;
export const purchaseProcedure: Procedure = {
  id: "synthetic-purchase-v2",
  title: "물품 구매·검수·지급 · 가상 연습",
  keywords: "물품 구매 납품 검수 지급 청구",
  institution: "가상 푸른시",
  source: "합성 구매 지침 · 실제 규정 아님",
  version: "연습 v1",
  text: purchaseText,
  questions: [
    {
      id: "stage",
      label: "물품 구매가 어느 단계인가요?",
      quote: purchaseText.split("\n").slice(1, 4).join("\n"),
      options: [
        {
          value: "before",
          label: "구매 시작 전",
          phrases: ["물품을 구매하려고", "물품을 사려고", "구매 시작 전"],
        },
        {
          value: "received",
          label: "납품 후 검수 전",
          phrases: [
            "납품받았고 검수 전",
            "납품을 받았고 검수 전",
            "납품 후 검수 전",
            "물품을 받았는데 검수 전",
          ],
        },
        {
          value: "payment",
          label: "검수 완료·지급 전",
          phrases: ["검수를 마쳤", "검수가 끝났", "검수 완료"],
        },
      ],
    },
  ],
  steps: [
    {
      action: "견적서·구매요구서로 예산과 승인 확인",
      deadline: "",
      form: "견적서·구매요구서",
      quote:
        "구매를 시작하기 전에는 견적서와 구매요구서를 준비하여 예산 및 구매 승인을 확인한다.",
      condition: { questionId: "stage", value: "before" },
    },
    {
      action: "납품서와 물품 대조 후 검수조서 작성",
      deadline: "",
      form: "납품서·검수조서",
      quote:
        "납품을 받았으나 검수 전인 경우 납품서와 물품을 대조하여 검수조서를 작성한다. 하자나 수량 차이는 보완을 요청한다.",
      condition: { questionId: "stage", value: "received" },
    },
    {
      action: "검수조서·청구서·세금계산서 대조 후 지급 서류 준비",
      deadline: "",
      form: "검수조서·청구서·세금계산서",
      quote:
        "검수를 마친 뒤 지급 전인 경우 검수조서와 청구서 및 세금계산서를 대조하고 지급 서류를 준비한다.",
      condition: { questionId: "stage", value: "payment" },
    },
    {
      action: "현재 단계의 서류 누락과 기관 결재선 확인",
      deadline: "담당 부서에 확인",
      form: "",
      quote:
        "모든 단계에서 현재 단계의 서류 누락과 기관별 결재선을 확인한다. 기한과 계약 방식은 담당 부서에 확인한다.",
    },
  ],
};
