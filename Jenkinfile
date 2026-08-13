pipeline {
    agent any

    stages {

        stage('Checkout') {
            steps {
                echo 'Checking out Task Manager source code...'
                checkout scm
            }
        }

        stage('Build Backend Image') {
            steps {
                echo 'Building backend Docker image...'
                sh 'docker build -t taskmanager-backend:latest ./backend'
            }
        }

        stage('Build Frontend Image') {
            steps {
                echo 'Building frontend Docker image...'
                sh 'docker build -t taskmanager-frontend:latest ./frontend'
            }
        }

    }

    post {
        success {
            echo 'Task Manager CI pipeline completed successfully!'
        }

        failure {
            echo 'Task Manager CI pipeline failed.'
        }
    }
}