import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useInputs from '../../../../hooks/useInputs';
import { db, storage } from '../../../../firebase/firebaseConfig';
import { uploadImagesAndUpdateFirestore } from '../../../../utils/uploadUtils';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, listAll, ref } from 'firebase/storage';
import { useAtom, useAtomValue } from 'jotai';
import {
  blocksAtom,
  deleteModalVisibleAtom,
  modalVisibleAtom,
  userAtom,
} from '../../../../atoms/Atom';
import { O } from '../Blocks.styles';
import IconFormCheck from '../../../../assets/images/common/icon/icon-Formcheck.webp';
import IconModalConfirm from '../../../../assets/images/common/icon/icon-modalConfirm.webp';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { DatePicker, Modal, Space, message } from 'antd';
import { CameraOutlined } from '@ant-design/icons';
import { LeftOutlined } from '@ant-design/icons';
dayjs.extend(customParseFormat);
const { RangePicker } = DatePicker;

// 오늘 이전의 날짜는 선택 불가능하도록 설정하는 함수
const disabledDate = (current) => {
  return current && current < dayjs().endOf('day');
};

const Reservation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const user = useAtomValue(userAtom);
  const userUid = user?.uid;

  const blockId = location.state ? location.state.blocksId : null;
  const [blocks] = useAtom(blocksAtom);
  const selectedBlock = blocks.find((block) => block.id === blockId) || '';

  const [modalVisible, setModalVisible] = useAtom(modalVisibleAtom);
  const [deleteModalVisible, setDeleteModalVisible] = useAtom(
    deleteModalVisibleAtom,
  );

  const [{ title, description, numberOfPeople }, onChange] = useInputs({
    title: selectedBlock?.title || '',
    description: selectedBlock?.description || '',
    numberOfPeople: selectedBlock?.numberOfPeople || 0,
  });

  const [titleTextCount, setTitleTextCount] = useState(0);
  const [descriptionTextCount, setDescriptionTextCount] = useState(0);

  const [pickDate, setPickDate] = useState(
    selectedBlock ? selectedBlock?.pickDate : '',
  );
  const [startDate, setStartDate] = useState(
    selectedBlock ? selectedBlock?.startDate : '',
  );
  const [endDate, setEndDate] = useState(
    selectedBlock ? selectedBlock?.endDate : '',
  );

  // 실제로 업로드한 이미지 정보를 저장하는 배열
  const [uploadedImages, setUploadedImages] = useState(
    selectedBlock?.images || [],
  );

  // 최대 업로드 가능한 이미지 개수
  const maxUploads = 4;

  // 이미지 업로드 시 실행되는 함수
  const handleImageChange = async (e) => {
    const selectedFiles = e.target.files;

    if (uploadedImages.length >= maxUploads) {
      // 이미지 개수가 최대 개수에 도달한 경우 모달 창을 띄워 알림 표시
      Modal.info({
        content: `이미지는 최대 ${maxUploads}장까지 첨부할 수 있어요.`,
      });
      return;
    }

    // 선택한 이미지들을 새로운 배열로 만들어 업로드 이미지 배열에 합침
    const newImages = [...uploadedImages, ...Array.from(selectedFiles)];

    setUploadedImages(newImages);
  };

  // 저장 버튼
  const handleAddButtonClick = async (e) => {
    e.preventDefault();

    if (!userUid) {
      message.error(
        '작업을 위해 로그인이 필요합니다. 로그인 페이지로 이동합니다.',
      );
      navigate('/login');
      return;
    }

    // Block 정렬을 위해 숫자로 blockId 값 지정
    const querySnapshot = await getDocs(
      query(collection(db, 'template'), where('userId', '==', userUid)),
    );
    let maxNum = 0;
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.blockId && typeof data.blockId === 'number') {
        // "id" 값이 숫자이고 "userId"가 userUid와 일치하는 경우만 처리
        maxNum = Math.max(maxNum, data.blockId);
      }
    });
    const blockId = maxNum + 1;

    try {
      // Firestore에 데이터 추가
      const docRef = await addDoc(collection(db, 'template'), {
        title,
        description,
        numberOfPeople,
        pickDate,
        startDate,
        endDate,
        blockKind: 'reservation',
        createdAt: serverTimestamp(),
        blockId: blockId,
        userId: userUid,
      });

      // 이미지 업로드 및 URL 저장
      await uploadImagesAndUpdateFirestore(
        uploadedImages,
        blockId,
        docRef,
        storage,
        'reservationImages',
      );

      setModalVisible(true);
    } catch (error) {
      message.error('저장 중 오류 발생:', error.message);
    }
  };

  // "수정하기" 버튼 클릭 시 실행되는 함수
  const handleEditButtonClick = async (e) => {
    e.preventDefault();
    try {
      // Firestore에 데이터 업로드
      const docRef = doc(db, 'template', blockId);
      await updateDoc(docRef, {
        title,
        description,
        numberOfPeople,
        pickDate,
        startDate,
        endDate,
      });

      await uploadImagesAndUpdateFirestore(
        uploadedImages,
        blockId,
        docRef,
        storage,
        'reservationImages',
      );

      setModalVisible(true);
    } catch (error) {
      message.error('수정 중 오류 발생:', error.message);
    }
  };

  const datePickInput = (_, dateString) => {
    setPickDate(dateString);
  };

  const periodPickInput = (_, dateString) => {
    setStartDate(dateString[0]);
    setEndDate(dateString[1]);
  };
  // "삭제하기" 버튼 클릭 시 실행되는 함수
  const handleRemoveButtonClick = async (id) => {
    const folderRef = ref(storage, `reservationImages/${id}`);

    try {
      const shouldDelete = window.confirm('정말 삭제하시겠습니까?');
      if (shouldDelete) {
        // 폴더 내의 모든 파일 가져오기
        const fileList = await listAll(folderRef);

        // 폴더 내의 각 파일을 순회하며 삭제
        await Promise.all(
          fileList.items.map(async (file) => {
            await deleteObject(file);
          }),
        );

        // 사용자 확인 후 Firestore 문서 삭제
        await deleteDoc(doc(db, 'template', id));

        setDeleteModalVisible(true);
      }
    } catch (error) {
      message.error('삭제 중 오류 발생:', error.message);
    }
  };

  // 이미지 삭제 시 실행되는 함수
  const handleRemoveImage = (index) => {
    const updatedImages = [...uploadedImages];
    updatedImages.splice(index, 1);
    setUploadedImages(updatedImages);
  };

  return (
    <>
      <O.HeaderStyle>
        <button onClick={() => navigate(`/admin/${userUid}`)}>
          <LeftOutlined />
        </button>
        <p>설정</p>
      </O.HeaderStyle>

      <O.FormGuideStyle>
        <h2>
          예약 서비스 <img src={IconFormCheck} alt="폼체크아이콘" />
        </h2>
        <p>
          팬, 구독자가 예약을 할 수 있는 신청 폼 입니다. 강연 등 인원수가 제한된
          행사를 개최한다면 <span>[예약신청 폼]</span>을 활용해보세요. 고객관리
          페이지에서 신청목록을 확인하실 수 있습니다.
        </p>
      </O.FormGuideStyle>

      <O.Container
        onSubmit={blockId ? handleEditButtonClick : handleAddButtonClick}
      >
        <label htmlFor="title">
          예약 서비스 이름
          <p>{titleTextCount}/20자</p>
        </label>
        <div className="input-container">
          <input
            id="title"
            name="title"
            placeholder="예약 서비스 🗓️"
            value={title}
            onChange={(e) => {
              onChange(e);
              setTitleTextCount(e.target.value.length);
            }}
            maxLength={20}
            autoFocus
          />
          {!title ? <span>필수 입력 항목입니다.</span> : null}
        </div>

        <O.ImageContainer>
          {uploadedImages.length >= maxUploads ? (
            <>
              <div onClick={handleImageChange}>
                <label>
                  <CameraOutlined />
                  <span>{`${uploadedImages.length} / ${maxUploads}`}</span>
                </label>
              </div>
            </>
          ) : (
            <>
              <label htmlFor="file">
                <CameraOutlined />
                <span>{`${uploadedImages.length} / ${maxUploads}`}</span>
              </label>
              <input
                id="file"
                type="file"
                accept="image/*"
                multiple // 다중 선택
                onChange={handleImageChange}
              />
            </>
          )}

          {uploadedImages.map((image, index) => {
            return (
              <O.Preview key={index}>
                <div
                  className="square-preview"
                  style={{
                    backgroundImage: `url(${
                      typeof image === 'string'
                        ? image
                        : URL.createObjectURL(image)
                    })`,
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveImage(index)}
                />
              </O.Preview>
            );
          })}
        </O.ImageContainer>

        <label htmlFor="description">
          예약 상세설명
          <p>{descriptionTextCount}/80자</p>
        </label>
        <div className="input-container">
          <textarea
            id="description"
            name="description"
            placeholder="상세 설명을 입력해 주세요."
            value={description}
            onChange={(e) => {
              onChange(e);
              setDescriptionTextCount(e.target.value.length);
            }}
            maxLength={80}
          />
          {!description ? <span>필수 입력 항목입니다.</span> : null}
        </div>

        <label htmlFor="number">모집 인원</label>
        <div className="input-container">
          <input
            id="number"
            name="numberOfPeople"
            type="number"
            placeholder={'모집 인원을 선택해주세요'}
            value={numberOfPeople}
            onChange={onChange}
            min={0}
          />
          {!numberOfPeople ? <span>필수 입력 항목입니다.</span> : null}
        </div>

        <label htmlFor="datePicker">행사 날짜</label>
        <Space direction="vertical" size={12}>
          <DatePicker
            id="datePicker"
            value={pickDate ? dayjs(pickDate) : undefined}
            disabledDate={disabledDate}
            onChange={datePickInput}
            popupClassName="datePickerPopup"
          />
          {!pickDate ? <span>필수 입력 항목입니다.</span> : null}
        </Space>

        <label htmlFor="rangePicker">모집 기간</label>
        <Space direction="vertical" size={12}>
          <RangePicker
            id="rangePicker"
            value={[
              startDate ? dayjs(startDate) : null,
              endDate ? dayjs(endDate) : null,
            ]}
            onChange={periodPickInput}
            disabledDate={disabledDate}
            popupClassName="periodPickerPopup"
          />
          {!startDate || !endDate ? <span>필수 입력 항목입니다.</span> : null}
        </Space>

        <O.ButtonArea>
          <O.SubmitButton
            type="submit"
            disabled={
              !title ||
              !description ||
              !numberOfPeople ||
              !pickDate ||
              !startDate ||
              !endDate
            }
          >
            {blockId ? '수정하기' : '저장하기'}
          </O.SubmitButton>
          <O.SubmitButton
            type="button"
            color="#313733"
            onClick={() => handleRemoveButtonClick(blockId)}
          >
            삭제하기
          </O.SubmitButton>
        </O.ButtonArea>
      </O.Container>

      <O.Modal
        title=""
        centered
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          navigate(-1);
        }}
        footer={null}
        closable={false}
        width={330}
      >
        <div>
          <img src={IconModalConfirm} alt="완료아이콘" />
          <h1>{blockId ? '수정완료!' : '저장완료!'}</h1>
          <p>{blockId ? '수정이 완료되었습니다.' : '저장이 완료되었습니다.'}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setModalVisible(false);
            navigate(-1);
          }}
        >
          닫기
        </button>
      </O.Modal>

      <O.Modal
        title=""
        centered
        open={deleteModalVisible}
        onCancel={() => {
          setDeleteModalVisible(false);
          navigate(-1);
        }}
        footer={null}
        closable={false}
        width={330}
      >
        <div>
          <img src={IconModalConfirm} alt="완료아이콘" />
          <h1>삭제완료!</h1>
          <p>삭제가 완료되었습니다.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDeleteModalVisible(false);
            navigate(-1);
          }}
        >
          닫기
        </button>
      </O.Modal>
    </>
  );
};
export default Reservation;
