FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY backend/pom.xml ./pom.xml
RUN mvn -q -DskipTests dependency:go-offline
COPY backend/src ./src
# Checkstyle 配置参与 validate 阶段（mvn package 会执行），构建阶段必须一并复制。
COPY backend/config ./config
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
# curl 仅用于容器健康检查（/actuator/health），不进入业务运行路径。
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/cargo-planner-backend-0.1.0.jar ./app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
