"use client";

import { useState, Suspense } from "react";
import { supabase } from "./supabase";
import { Camera, Send, MapPin, Phone, AlertCircle, CheckCircle } from "lucide-react";
import Script from "next/script";
import { useSearchParams, useRouter } from "next/navigation";

function ReceiptForm() {
  // URL에서 userId 파라미터 추출 (예: ?userId=사장님고유ID)
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [detailAddress, setDetailAddress] = useState("");
  const [symptom, setSymptom] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false); // 접수 완료 상태 추가

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      if (selectedFiles.length > 5) {
        alert("사진은 최대 5장까지만 첨부할 수 있습니다.");
        e.target.value = ""; // 파일 선택 창 초기화
        setPhotos([]);
        return;
      }
      setPhotos(selectedFiles);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, ""); // 숫자만 남기기
    let formatted = value;

    if (value.length < 4) {
      formatted = value;
    } else if (value.startsWith("02")) {
      if (value.length < 6) {
        formatted = `${value.slice(0, 2)}-${value.slice(2)}`;
      } else if (value.length < 10) {
        formatted = `${value.slice(0, 2)}-${value.slice(2, 5)}-${value.slice(5)}`;
      } else {
        formatted = `${value.slice(0, 2)}-${value.slice(2, 6)}-${value.slice(6, 10)}`;
      }
    } else {
      if (value.length < 8) {
        formatted = `${value.slice(0, 3)}-${value.slice(3)}`;
      } else if (value.length < 11) {
        formatted = `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6)}`;
      } else {
        formatted = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`;
      }
    }

    setPhone(formatted);
  };

  const openDaumPostcode = () => {
    if (typeof window === "undefined" || !(window as any).daum) return;

    new (window as any).daum.Postcode({
      oncomplete: function (data: any) {
        setAddress(data.address);
      },
    }).open();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !address || !symptom) {
      alert("연락처, 주소, 증상을 모두 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      let photoUrls: string[] = [];

      // 1. 사진이 있다면 Supabase Storage 'photos' 버킷에 모두 업로드
      if (photos.length > 0) {
        const uploadPromises = photos.map(async (file) => {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
          const filePath = `receipts/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('photos')
            .upload(filePath, file);

          if (uploadError) throw new Error(`이미지 업로드 실패: ${uploadError.message}`);

          // 1-1. 업로드된 이미지의 공개 URL 가져오기
          const { data: publicUrlData } = supabase.storage
            .from('photos')
            .getPublicUrl(filePath);
            
          return publicUrlData.publicUrl;
        });

        photoUrls = await Promise.all(uploadPromises);
      }

      // 2. 웹 폼 제출 시 Supabase 'consultations' 테이블로 전송할 데이터 페이로드 구성
      const requestData = {
        user_id: userId,
        phone,
        address,
        detail_address: detailAddress,
        summary: symptom,
        images: photoUrls.length > 0 ? photoUrls : [], // 업로드된 모든 사진 URL을 배열로 전송 (사진이 없으면 빈 배열)
        is_ai_received: true
      };

      const { error: dbError } = await supabase
        .from('consultations')
        .insert([requestData]);

      if (dbError) throw new Error(`데이터 저장 실패: ${dbError.message}`);

      // 접수 완료 상태로 변경 (alert 제거)
      setIsSubmitted(true);
      
      // 접수 완료 후 폼 초기화
      setPhone("");
      setDetailAddress("");
      setAddress("");
      setSymptom("");
      setPhotos([]);

    } catch (error: any) {
      console.error(error);
      alert("접수 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주시거나 관리자에게 문의해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 완료 화면을 보여줄 조건 분기
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-[#f0f4f9] flex flex-col items-center justify-center py-10 px-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border-t-8 border-green-500 p-8 text-center space-y-6">
          <div className="flex justify-center">
            <CheckCircle className="w-16 h-16 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">접수가 완료되었습니다!</h2>
          <p className="text-gray-600 leading-relaxed">
            고객님의 소중한 접수 내역이 성공적으로 전달되었습니다.<br/>
            사장님이 확인 후, 기재해주신 연락처로 신속하게 연락드리겠습니다.
          </p>
          <button
            onClick={() => setIsSubmitted(false)}
            className="mt-6 w-full bg-blue-600 text-white font-medium rounded px-4 py-3 hover:bg-blue-700 transition-colors shadow-sm"
          >
            새로운 접수하기
          </button>
        </div>
      </div>
    );
  }

  // userId가 없는 경우 잘못된 접근 처리 (폼 가리기)
  if (!userId) {
    return (
      <div className="min-h-screen bg-[#f0f4f9] flex flex-col items-center justify-center py-10 px-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border-t-8 border-red-500 p-8 text-center space-y-6">
          <div className="flex justify-center">
            <AlertCircle className="w-16 h-16 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">잘못된 접근입니다.</h2>
          <p className="text-gray-600 leading-relaxed">
            유효한 링크나 QR 코드를 통해 접속해 주세요.
          </p>
          <button
            onClick={() => router.back()}
            className="mt-4 w-full bg-gray-100 text-gray-700 font-medium rounded px-4 py-3 hover:bg-gray-200 transition-colors shadow-sm"
          >
            이전 페이지로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f4f9] py-2 sm:py-8 px-4 font-sans sm:px-6 lg:px-8 flex justify-center">
      <Script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js" strategy="lazyOnload" />

      <div className="max-w-2xl w-full space-y-2 sm:space-y-4">
        
        {/* 헤더 섹션 (구글 폼 스타일 상단 띠) */}
        <div className="bg-white rounded-xl shadow-sm border-t-8 border-blue-600 p-4 sm:p-8">
          <h1 className="text-xl sm:text-3xl font-semibold text-gray-900 mb-1 sm:mb-3">🛠️ 김반장 AI 무인 접수</h1>
          <p className="text-xs sm:text-base text-gray-600 mb-1">
            빠르고 간편하게 접수해 주세요. 확인 후 신속하게 연락드리겠습니다.
          </p>
          <div className="border-t border-gray-200 mt-2 pt-2 sm:mt-4 sm:pt-4">
            <span className="text-red-500 font-medium text-xs sm:text-sm">* 필수항목</span>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-4">
          
          {/* 1. 연락처 */}
          <div className="bg-white rounded-xl shadow-sm p-4 pb-4 sm:p-6 sm:pb-8 transition-shadow hover:shadow-md">
            <label className="flex items-center text-sm sm:text-base font-medium text-gray-900 mb-2 sm:mb-4">
              연락처 <span className="text-red-500 ml-1">*</span>
            </label>
            <div className="flex items-center">
              <Phone className="w-5 h-5 text-gray-400 mr-3" />
              <input
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                maxLength={13}
                placeholder="내 답변"
                className="w-full sm:w-1/2 border-b border-gray-300 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-600 focus:border-b-2 transition-colors bg-transparent"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* 2. 방문 주소 */}
          <div className="bg-white rounded-xl shadow-sm p-4 pb-4 sm:p-6 sm:pb-8 transition-shadow hover:shadow-md">
            <label className="flex items-center text-sm sm:text-base font-medium text-gray-900 mb-2 sm:mb-4">
              방문 주소 <span className="text-red-500 ml-1">*</span>
            </label>
            <div className="flex items-center">
              <MapPin className="w-5 h-5 text-gray-400 mr-3" />
              <div className="w-full flex gap-2">
                <input
                  type="text"
                  value={address}
                  readOnly
                  onClick={openDaumPostcode}
                  placeholder="주소 검색을 눌러주세요"
                  className="w-full border-b border-gray-300 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-600 focus:border-b-2 transition-colors bg-transparent cursor-pointer"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={openDaumPostcode}
                  disabled={isSubmitting}
                  className="shrink-0 bg-gray-100 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  검색
                </button>
              </div>
            </div>
            <div className="flex items-center mt-2">
              <div className="w-5 h-5 mr-3"></div>
              <input
                type="text"
                value={detailAddress}
                onChange={(e) => setDetailAddress(e.target.value)}
                placeholder="상세 주소를 입력해주세요"
                className="w-full border-b border-gray-300 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-600 focus:border-b-2 transition-colors bg-transparent"
                disabled={isSubmitting || !address}
              />
            </div>
          </div>

          {/* 3. 증상 */}
          <div className="bg-white rounded-xl shadow-sm p-4 pb-4 sm:p-6 sm:pb-8 transition-shadow hover:shadow-md">
            <label className="flex items-center text-sm sm:text-base font-medium text-gray-900 mb-2 sm:mb-4">
              고장/수리 증상 <span className="text-red-500 ml-1">*</span>
            </label>
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-gray-400 mr-3 mt-2" />
              <textarea
                value={symptom}
                onChange={(e) => setSymptom(e.target.value)}
                placeholder="상세 내용을 적어주세요"
                rows={2}
                className="w-full border-b border-gray-300 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-600 focus:border-b-2 transition-colors bg-transparent resize-none"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* 4. 사진 첨부 */}
          <div className="bg-white rounded-xl shadow-sm p-4 pb-4 sm:p-6 sm:pb-8 transition-shadow hover:shadow-md">
            <label className="flex items-center text-sm sm:text-base font-medium text-gray-900 mb-2 sm:mb-4">
              현장 사진 (선택, 최대 5장)
            </label>
            <div className="flex items-center">
              <Camera className="w-5 h-5 text-gray-400 mr-3" />
              <input
                type="file"
                accept="image/*"
              multiple
                onChange={handlePhotoChange}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50 cursor-pointer"
                disabled={isSubmitting}
              />
            </div>
          {photos.length > 0 && (
            <p className="mt-2 ml-8 text-sm text-blue-600 font-medium">
              ✅ 총 {photos.length}장의 사진이 선택되었습니다.
            </p>
          )}
          </div>

          {/* 제출 버튼 */}
          <div className="flex items-center justify-between pt-1 pb-6">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 text-white font-medium rounded px-6 py-2.5 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:bg-blue-400 flex items-center shadow-sm"
            >
              {isSubmitting ? "제출 중..." : "제출"}
            </button>
            <span className="text-sm text-gray-500 font-medium">
              김반장 AI 접수 시스템
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f0f4f9] flex items-center justify-center font-medium text-gray-500">로딩 중...</div>}>
      <ReceiptForm />
    </Suspense>
  );
}
