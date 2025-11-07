import { aiAPI } from "../services/api";
import { FlowType, ClassInfo } from "./types";

export const uploadRegularFile = async (file: File, sessionId: string) => {
  return await aiAPI.uploadFile({
    file,
    session_id: sessionId,
  });
};

export const uploadAttendanceImage = async (
  file: File,
  classInfo: ClassInfo,
  sessionId: string
) => {
  try {
    const result = await aiAPI.processAttendanceImage({
      file,
      session_id: sessionId,
      class_: classInfo.class_,
      section: classInfo.section,
      date: classInfo.date,
    });

    if (result.status === "success" && result.data) {
      return {
        message: result.data.message,
        data: {
          attendance_summary: result.data.attendance_summary,
          class_info: result.data.class_info,
          ocr_text: result.data.ocr_text,
          bulkattandance: result.data.bulkattandance,
          finish_collecting: result.data.finish_collecting,
        },
      };
    } else {
      if (result.message && result.message.includes("vision-capable model")) {
        return {
          message:
            "Image processing is not available with the current model. Please provide attendance data as text instead.",
          data: {
            attendance_summary: [],
            class_info: classInfo,
            ocr_text: "",
            bulkattandance: false,
            finish_collecting: false,
            fallback_message:
              "Please type the attendance data directly. For example: 'Mark all present for Class 6 A on 2025-10-08' or list individual students.",
          },
        };
      }
      throw new Error(result.message || "Image processing failed");
    }
  } catch (err) {
    console.error("Error processing attendance image:", err);
    return {
      message:
        "Image processing failed. Please provide attendance data as text instead.",
      data: {
        attendance_summary: [],
        class_info: classInfo,
        ocr_text: "",
        bulkattandance: false,
        finish_collecting: false,
        fallback_message:
          "You can type the attendance data directly. For example: 'Mark all present for Class 6 A on 2025-10-08' or list individual students.",
      },
    };
  }
};

export const uploadFile = async (
  file: File,
  activeFlow: FlowType,
  sessionId: string
) => {
  if (activeFlow !== "attendance") throw new Error("Upload not allowed");

  if (file.type.startsWith("image/")) {
    throw new Error("Image processing requires class information");
  } else {
    return await uploadRegularFile(file, sessionId);
  }
};

