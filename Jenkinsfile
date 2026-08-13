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
                sh 'docker build -t prajakta372/taskmanager-backend:latest ./backend'
            }
        }

        stage('Build Frontend Image') {
            steps {
                echo 'Building frontend Docker image...'
                sh 'docker build -t prajakta372/taskmanager-frontend:latest ./frontend'
            }
        }

        stage('Push Backend Image') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-credentials',
                    usernameVariable: 'DOCKER_USERNAME',
                    passwordVariable: 'DOCKER_PASSWORD'
                )]) {
                    sh '''
                        echo "$DOCKER_PASSWORD" | docker login \
                            -u "$DOCKER_USERNAME" \
                            --password-stdin

                        docker push prajakta372/taskmanager-backend:latest
                    '''
                }
            }
        }

        stage('Push Frontend Image') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-credentials',
                    usernameVariable: 'DOCKER_USERNAME',
                    passwordVariable: 'DOCKER_PASSWORD'
                )]) {
                    sh '''
                        echo "$DOCKER_PASSWORD" | docker login \
                            -u "$DOCKER_USERNAME" \
                            --password-stdin

                        docker push prajakta372/taskmanager-frontend:latest
                    '''
                }
            }
        }

        stage('Deploy to Kubernetes') {
    steps {
        echo 'Deploying Task Manager to Kubernetes...'

        sh '''
            ssh -i /var/lib/jenkins/.ssh/taskmanager_key \
                -o StrictHostKeyChecking=no \
                ubuntu@10.0.1.170 \
                "sudo kubectl apply -f /home/ubuntu/Task-Manager-DevSecOps/k8s/"
        '''
    }
}

stage('Verify Deployment') {
    steps {
        echo 'Checking Kubernetes deployment status...'

        sh '''
            ssh -i /var/lib/jenkins/.ssh/taskmanager_key \
                -o StrictHostKeyChecking=no \
                ubuntu@10.0.1.170 \
                "sudo kubectl rollout status deployment/backend -n taskmanager --timeout=120s"

            ssh -i /var/lib/jenkins/.ssh/taskmanager_key \
                -o StrictHostKeyChecking=no \
                ubuntu@10.0.1.170 \
                "sudo kubectl rollout status deployment/frontend -n taskmanager --timeout=120s"

            ssh -i /var/lib/jenkins/.ssh/taskmanager_key \
                -o StrictHostKeyChecking=no \
                ubuntu@10.0.1.170 \
                "sudo kubectl get pods -n taskmanager"
        '''
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

        always {
            echo 'Pipeline execution completed.'
        }
    }
}