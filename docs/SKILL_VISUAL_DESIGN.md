# Thiết kế animation và hiệu ứng kỹ năng pixel 2D

## Mục tiêu

- Mỗi skill có hình ảnh nhận ra được từ tên và linh căn: kiếm, rễ cây, băng tiễn,
  hỏa liên, lôi xích, tinh quang và các motif tương ứng.
- Animation dùng khối pixel và màu phẳng, nét 2D hợp với map; không dùng blur,
  gradient hay vòng tròn làm hình ảnh duy nhất.
- Nhân vật và quái vật phản hồi rõ khi tung đòn, trúng đòn, né hoặc bị hạ.
- Client chỉ trình bày. Server tiếp tục quyết định sát thương, trúng/trượt, buff,
  thời lượng hiệu ứng và kết quả rơi đồ.

## Nhịp animation

| Pha | Thời lượng hiển thị | Hành vi |
| --- | ---: | --- |
| Báo chiêu | khoảng 230 ms | Nhân vật đổi sang hàng attack hoặc cast; các mảnh pixel tụ quanh người theo linh căn. |
| Phóng chiêu | nằm trong vòng đời hiệu ứng | Tia, lưỡi kiếm, hạt phép, dây sét hoặc luồng gió đi từ người thi triển tới tâm mục tiêu. |
| Va chạm | khoảng 580 ms; tuyệt kỹ tier 3 khoảng 760 ms | Tạo hình riêng của skill; đòn chí mạng tăng độ sáng và độ rộng. |
| Kết dư | cuối vòng đời | Mảnh pixel tắt dần; hiệu ứng không lưu trạng thái chiến đấu ở client. |

Buff, hồi máu, hồi MP và thanh tẩy hiện ngay trên nhân vật khi nhận skill_result.
Kỹ năng chủ động trong sổ thần thông có nút **Xem** để xem thử VFX mà không tiêu
hao MP, hồi chiêu hay thay đổi kết quả chiến đấu. Skill chưa học cũng có thể xem.

## Bảng màu linh căn

| Linh căn | Màu chính | Màu sáng | Dấu hiệu hình ảnh |
| --- | --- | --- | --- |
| Kim | #e6c66d | #fff0b2 | Lưỡi kim loại, mảnh giáp, kiếm nhận |
| Mộc | #71b96e | #c8f29b | Lá, mầm, cành và rễ |
| Thủy | #4fa6d8 | #b9efff | Băng, giọt nước, sóng và tuyết |
| Hỏa | #e56a3e | #ffd16b | Tàn lửa, hỏa liên, cột lửa |
| Thổ | #ae8551 | #e4c37a | Nắm đá, nứt đất, giáp và thạch lao |
| Quang | #e8dc8a | #fffbe0 | Tia sáng, sao, mặt trời và thanh tẩy |
| Ám | #9565c6 | #d7a6ed | Mắt, bóng, lưới nguyền và hút hồn |
| Phong | #62c5b5 | #c6f6d2 | Lưỡi gió, lá bay, lốc và tầng gió |
| Lôi | #efcf4f | #fff4a2 | Tia sét gấp khúc, điện liên và lôi vực |

## 54 skill theo linh căn

### Kim

| Skill | Thiết kế animation |
| --- | --- |
| KIM_KICH — Kim Kích | Báo chiêu gom mảnh vàng; một nhát chém ngang và tia va chạm nhỏ. |
| THIET_HO — Thiết Hộ | Các mảnh giáp ghép thành khiên trước người; cạnh khiên lóe sáng một nhịp. |
| PHA_GIAP — Phá Giáp | Tia chém nổ thành tám mảnh kim loại văng khỏi mục tiêu. |
| KIM_LUAN — Kim Luân | Bốn lưỡi kim luân quay quanh nhân vật rồi khép lại thành ấn buff. |
| VAN_KIM_TRAM — Vạn Kim Trảm | Nhiều kiếm nhận rơi từ trên xuống; tuyệt kỹ có thêm đợt sáng cuối. |
| KIM_SAT_THANH — Kim Sát Thành | Một lưỡi trăng vàng cong quét qua mục tiêu, kết thúc bằng bụi sáng. |

### Mộc

| Skill | Thiết kế animation |
| --- | --- |
| MOC_DUONG — Mộc Dưỡng | Ba mầm lá vươn lên quanh nhân vật; dấu cộng sinh lực hiện ở tâm. |
| RE_MOC — Rễ Mộc | Rễ bật khỏi mặt đất hai bên mục tiêu và khép vòng trói. |
| SINH_TRUONG — Sinh Trưởng | Ba thân mầm lớn dần, lá nở theo nhịp hồi phục. |
| MOC_LAO — Mộc Lao | Cành mọc từ dưới lên thành khung lao quanh mục tiêu. |
| VAN_MOC_THANH — Vạn Mộc Thành | Ba tán cây pixel dựng lên theo lớp, rễ tạo thành vùng lâm trận. |
| MOC_HON_DON — Mộc Hồn Độn | Hạt mộc hồn bay theo quỹ đạo tới mục tiêu, kéo theo hai chiếc lá sáng. |

### Thủy

| Skill | Thiết kế animation |
| --- | --- |
| BANG_TIEN — Băng Tiễn | Mũi tên băng nhọn bay thẳng, để lại đuôi tinh thể. |
| THUY_KHIEN — Thủy Khiên | Khiên giọt nước bao quanh người; hai giọt sáng chạy dọc cạnh khiên. |
| HAN_TRI — Hàn Trì | Vệt băng lan sát mặt đất quanh mục tiêu, kèm tinh thể dựng lên. |
| THUY_LUU — Thủy Lưu | Dải nước thấp cuộn ngang qua mục tiêu và văng giọt ở điểm chạm. |
| CUU_THIEN_BANG — Cửu Thiên Băng | Năm bông tuyết rơi lệch nhịp, kết thành băng vụn tại điểm đánh. |
| THUYET_HAI — Tuyết Hải | Một đợt sóng rộng cuộn ngang, có hai lớp bọt và vòng nước kết thúc. |

### Hỏa

| Skill | Thiết kế animation |
| --- | --- |
| HOA_CAU — Hỏa Cầu | Cầu lửa cam vàng bay tới, đuôi lửa nhấp nháy theo từng cụm pixel. |
| HOA_YEM — Hỏa Yểm | Đốm u hỏa nhỏ bắn nhanh, để lại tàn lửa màu đỏ sẫm. |
| LIEN_HOA — Liên Hoa Hỏa | Tám cánh lửa mở quanh mục tiêu, tâm hoa lóe sáng. |
| PHAN_THIEN — Phần Thiên | Ấn mặt trời hiện trên người; tám tia ngắn đánh dấu buff chí mạng. |
| THIEN_HOA_LIEN — Thiên Hỏa Liên | Thiên hỏa rơi theo cụm rồi nở thành hoa lửa ở điểm chạm. |
| HOA_VUC — Hỏa Vực | Dải lửa sát đất bao vùng mục tiêu, các đốm than bay lên trong một nhịp. |

### Thổ

| Skill | Thiết kế animation |
| --- | --- |
| THO_KICH — Thổ Kích | Nắm đá lao tới; các vết nứt đất bung ra khi trúng. |
| THO_GIAP — Thổ Giáp | Phiến đá ráp thành giáp đa cạnh quanh nhân vật. |
| SON_CHAN — Sơn Chấn | Chấn động lan sát đất, bốn mảnh đá bật lên hai bên. |
| DIA_MACH — Địa Mạch | Các ký hiệu địa mạch xếp thành ấn vuông dưới chân người được buff. |
| SON_HA_DAI_THAN — Sơn Hà Đại Thân | Tảng núi pixel rơi xuống, kéo theo chấn động rộng hơn đòn thường. |
| THACH_LUYEN — Thạch Luyện | Trụ đá dựng quanh mục tiêu theo lớp thành một lồng thạch. |

### Quang

| Skill | Thiết kế animation |
| --- | --- |
| QUANG_DAO — Quang Đao | Lưỡi sáng chéo tạo hình chữ thập nhỏ khi chạm mục tiêu. |
| TINH_LOC — Tinh Lộc | Sao nhỏ tụ trên đầu nhân vật rồi rơi thành dấu hồi phục. |
| THANH_TAY — Thanh Tẩy | Năm vệt sáng quét dọc qua nhân vật, biểu thị gột hiệu ứng xấu. |
| QUANG_TOC — Quang Tốc | Năm vệt sáng lướt ngang người theo hai hướng như dấu tăng tốc. |
| THIEN_QUANG — Thiên Quang Phổ Chiếu | Cột quang rơi thẳng từ trên xuống, có lõi sáng và cạnh tia. |
| NHAT_DIEM — Nhất Diện Quang | Tám tia sao tỏa từ tâm, nở theo từng nhịp thay cho một vòng tròn đơn. |

### Ám

| Skill | Thiết kế animation |
| --- | --- |
| AM_THICH — Ám Thích | Năm ám châm nối đuôi nhau bay nhanh về phía mục tiêu. |
| AM_CHU — Ám Chú | Lưới nguyền pixel siết quanh mục tiêu, các nút giao lóe tím. |
| THUC_HON — Thực Hồn | Con mắt tối mở dần; đồng tử sáng khóa vào mục tiêu. |
| U_MINH — U Minh | Bàn tay u minh trồi lên và khép các ngón quanh mục tiêu. |
| CỬU_U_AM_GIOI — Cửu U Ám Giới | Vùng hư không mở thành hai lớp xoáy tối và bụi tím trôi lên. |
| AM_THUC — Ám Thực | Dải hồn lực rút từ mục tiêu về người thi triển, tâm hút sáng ở cuối. |

### Phong

| Skill | Thiết kế animation |
| --- | --- |
| PHONG_NHAN — Phong Nhẫn | Ba lưỡi gió chéo cắt qua mục tiêu. |
| THANH_PHONG — Thanh Phong | Lá nhẹ và vệt gió lướt ngang người khi tăng tốc. |
| PHONG_BO — Phong Bộ | Năm mảnh gió xoáy quanh mục tiêu theo quỹ đạo lốc. |
| LOAN_PHONG — Loạn Phong | Lồng gió xoắn khép từ hai bên, tạo nhịp trói ngắn. |
| CUU_TANG_PHONG — Cửu Tầng Phong | Chín tầng gió nối tiếp thành nhiều vệt cuộn quanh vùng trúng. |
| PHONG_LIEU — Phong Liêu | Sóng gió xiên quét qua mặt đất với các vệt phụ lệch hướng. |

### Lôi

| Skill | Thiết kế animation |
| --- | --- |
| LOI_KICH — Lôi Kích | Tia lôi gấp khúc đánh xuống mục tiêu, kết thúc bằng lóe điện. |
| LOI_HO — Lôi Hộ | Khiên đa cạnh có hai nhánh điện chạy quanh người. |
| DIEN_LIEN — Điện Liên | Đường điện ziczac nối từ người thi triển tới mục tiêu. |
| THIEN_LOI — Thiên Lôi | Một tia sét từ cao giáng xuống theo trục mục tiêu. |
| VAN_LOI_THIEN_PHAT — Vạn Lôi Thiên Phạt | Nhiều nhánh sét đánh lệch nhịp từ trên trời xuống. |
| LOI_VUC — Lôi Vực | Vùng sấm sát đất có tia điện nhấp theo mép và hạt sét dựng đứng. |

## 3 skill chung

| Skill | Thiết kế animation |
| --- | --- |
| THIEN_CANH — Thiền Cảnh | Dấu âm dương pixel và hạt sáng tụ vào người khi hồi MP. |
| NGU_HANH_KICH — Ngũ Hành Kích | Năm đốm màu Kim, Mộc, Thủy, Hỏa, Thổ hội tụ thành một đòn. |
| THANH_TAM — Thanh Tâm | Hình trái tim pixel sáng lên cùng năm vệt thanh tẩy. |

## 9 skill bị động

Aura chỉ xuất hiện nếu mã passive có trong learnedSkills; mỗi hệ có họa tiết riêng,
độ sáng thấp và nhịp chậm để không che nhân vật.

| Skill | Họa tiết aura |
| --- | --- |
| KIM_TAM_PHAP — Kim Thể Chi Pháp | Mảnh kim loại lóe ngắn quanh thân. |
| MOC_TAM_PHAP — Mộc Linh Sinh Pháp | Hai lá nhỏ xoay đối xứng. |
| THUY_TAM_PHAP — Thủy Đức Hộ Thể | Khiên nước mờ, cạnh xanh nhạt. |
| HOA_TAM_PHAP — Hỏa Tâm Liệt Ý | Đốm lửa ấm ở ngực và đầu. |
| THO_TAM_PHAP — Hậu Thổ Chân Thân | Mảnh đá nhỏ giữ vị trí quanh thân. |
| QUANG_TAM_PHAP — Quang Minh Tịnh Tâm | Tia sáng mềm phía trên đầu. |
| AM_TAM_PHAP — U Ám Liễm Tức | Vệt bóng tím mờ quanh chân. |
| PHONG_TAM_PHAP — Phong Hành Vô Ảnh | Hai nét gió lướt ngang. |
| LOI_TAM_PHAP — Lôi Thể Chi Pháp | Một nhánh điện nhỏ lóe theo nhịp chậm. |

## Tương tác nhân vật và quái vật

- Đòn thường của người chơi có tư thế chém và vệt va chạm pixel; đánh trượt vẫn có
  animation vung đòn nhưng không hiện sát thương giả.
- Skill vật lý chuyển nhân vật sang animation attack; skill phép/hỗ trợ chuyển sang
  cast. Bộ sprite nhân vật dùng hàng idle, walk, attack, cast nếu có sprite sheet.
- Quái dùng hàng attack của sprite sheet nếu asset cung cấp; quái không có sheet có
  cú chúi người, tay/vuốt bật ra và hướng đánh về mục tiêu.
- Đòn quái có VFX theo linh căn/loại tấn công. Khi trúng hoặc bị né, client hiển thị
  đòn đánh ở điểm va chạm; người chơi vẫn nhận hurt pose và số sát thương từ server.
- Online: combat_result cung cấp skill code và danh sách hit; skill_result xác nhận
  hỗ trợ; monster_update cùng player_combat_result xác nhận quái nào đánh ai.
  Hai thông điệp tấn công của quái được gộp trong một nhịp animation để tránh vẽ đôi.
- Offline: cùng hệ thống VFX được gọi từ kết quả local của Combat, SkillSystem và
  Monster; không áp dụng thay đổi sát thương/cooldown từ phần hiển thị.

## Ràng buộc hiển thị và hiệu năng

- Tất cả điểm ảnh vẽ bằng ô vuông Canvas và tọa độ được làm tròn theo lưới 2 px.
- Mỗi linh căn có bảng màu riêng; tier cao tăng số mảnh/kích thước nhưng giữ motif.
- VFX tồn tại ngắn, danh sách hiệu ứng có giới hạn; AOE vẽ tối đa 12 mục tiêu mỗi
  nhịp để tránh tăng tải khi quái chồng cụm.
- prefers-reduced-motion dùng một pose đứng ngắn, bỏ chuyển động xoay/lặp liên tục.
- Nút xem thử có nhãn trợ năng, không kích hoạt request combat.

## Ranh giới BE

Không cần thay đổi BE cho bộ hiển thị hiện tại. Client dùng contract đã có:
skillCode, hits, attackerId, targetId, state, attackType, linhCan, effect, heal,
mpRestore và buffs. Chỉ cần thêm contract nếu sau này muốn server quản lý cấu hình
VFX hoặc animation asset theo từng skill; khi đó có thể bổ sung vfxCode hoặc
animationCode vào kế hoạch BE trước khi triển khai.
