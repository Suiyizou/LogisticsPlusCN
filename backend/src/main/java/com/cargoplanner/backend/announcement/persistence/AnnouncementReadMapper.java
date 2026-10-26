package com.cargoplanner.backend.announcement.persistence;

import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** Explicit compound-key exception: no misleading single-id BaseMapper is exposed. */
@Mapper
public interface AnnouncementReadMapper {
  @Select("""
      <script>
      SELECT announcement_id, reader_type, reader_id, read_at FROM cp_announcement_reads
      WHERE reader_type = #{type} AND reader_id = #{readerId} AND announcement_id IN
      <foreach collection="ids" item="id" open="(" separator="," close=")">#{id}</foreach>
      </script>
      """)
  List<AnnouncementReadEntity> findForReader(
      @Param("type") String type, @Param("readerId") long readerId, @Param("ids") List<Long> ids);

  @Update("""
      UPDATE cp_announcement_reads SET read_at = #{at}
      WHERE announcement_id = #{id} AND reader_type = #{type} AND reader_id = #{readerId}
      """)
  int updateReceipt(@Param("id") long id, @Param("type") String type,
      @Param("readerId") long readerId, @Param("at") Instant at);

  @Insert("""
      INSERT INTO cp_announcement_reads (announcement_id, reader_type, reader_id, read_at)
      VALUES (#{id}, #{type}, #{readerId}, #{at})
      """)
  int insertReceipt(@Param("id") long id, @Param("type") String type,
      @Param("readerId") long readerId, @Param("at") Instant at);
}
